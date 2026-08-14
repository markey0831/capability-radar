import { beforeEach, describe, expect, it } from 'vitest'
import { QUESTION_BANK } from '../../../../shared/question-bank/load'
import type { AnswerCode } from '../../../../shared/question-bank/schema'
import type { IndividualDimensionScore, RaterLevel } from '../../../../shared/domain/types'
import type { AssignmentRecord, BatchRecord, ParticipantRecord, SubmissionRecord } from '../repositories/contracts'
import { MemoryManagementRepository } from '../repositories/memory/management-repository'
import { ResultService } from './result-service'

const role = QUESTION_BANK.roles[0]
const now = new Date('2026-08-13T08:00:00.000Z')

function makeBatch(status: BatchRecord['status'] = 'open'): BatchRecord {
  return {
    id: 'batch-1',
    name: '2026年8月销售岗评估',
    roleId: role.id,
    questionnaireVersionId: QUESTION_BANK.version,
    assessmentDate: '2026-08-13',
    startsAt: '2026-08-01T00:00:00.000Z',
    deadlineAt: '2026-08-31T15:59:59.999Z',
    status,
  }
}

function makeParticipant(): ParticipantRecord {
  return {
    id: 'participant-1',
    batchId: 'batch-1',
    personId: 'evaluatee-1',
    nameSnapshot: '张三',
    departmentSnapshot: '销售部',
    roleIdSnapshot: role.id,
    status: 'active',
  }
}

function makeAssignment(id: string, level: RaterLevel): AssignmentRecord {
  return {
    id,
    batchId: 'batch-1',
    participantId: 'participant-1',
    raterPersonId: `person-${id}`,
    raterNameSnapshot: `评分人${id}`,
    raterDepartmentSnapshot: '业务部',
    normalizedRaterName: `评分人${id}`,
    normalizedRaterDepartment: '业务部',
    level,
    status: 'submitted',
    currentSubmissionId: `submission-${id}`,
    submittedAt: now.toISOString(),
  }
}

function makeScores(value: number, missingDimensionId?: string): IndividualDimensionScore[] {
  return role.dimensions.map((dimension) => ({
    dimensionId: dimension.id,
    validAnswerCount: dimension.id === missingDimensionId ? 0 : 5,
    percentageScore: dimension.id === missingDimensionId ? null : value,
    fivePointScore: dimension.id === missingDimensionId ? null : value / 20,
  }))
}

function makeSubmission(id: string, assignmentId: string, value: number, missingDimensionId?: string): SubmissionRecord {
  return {
    id,
    assignmentId,
    batchId: 'batch-1',
    participantId: 'participant-1',
    questionnaireVersionId: QUESTION_BANK.version,
    scoringVersion: 'v1',
    answers: {} as Record<string, AnswerCode>,
    dimensionScores: makeScores(value, missingDimensionId),
    idempotencyKey: id,
    status: 'active',
    submittedAt: now.toISOString(),
  }
}

describe('ResultService', () => {
  let repository: MemoryManagementRepository
  let service: ResultService

  beforeEach(() => {
    repository = new MemoryManagementRepository({
      batches: [makeBatch()],
      participants: [makeParticipant()],
      assignments: [
        makeAssignment('superior-1', 'superior'),
        makeAssignment('superior-2', 'superior'),
        makeAssignment('peer-1', 'peer'),
      ],
      submissions: [
        makeSubmission('submission-superior-1', 'superior-1', 60),
        makeSubmission('submission-superior-2', 'superior-2', 100),
        makeSubmission('submission-peer-1', 'peer-1', 40),
      ],
    })
    repository.activeBatches.set(role.id, { roleId: role.id, batchId: 'batch-1', openedAt: now.toISOString() })
    service = new ResultService(repository, () => now, () => 'snapshot-1')
  })

  it('先计算同级多人均分，再按当前有效层级归一化权重', async () => {
    const result = await service.calculateParticipant('batch-1', 'participant-1')

    expect(result.dimensions[0].levels.superior).toEqual({ validRaterCount: 2, percentageMean: 80 })
    expect(result.dimensions[0].levels.peer).toEqual({ validRaterCount: 1, percentageMean: 40 })
    expect(result.dimensions[0].percentageScore).toBeCloseTo(65)
    expect(result.dimensions[0].fivePointScore).toBeCloseTo(3.25)
    expect(result.isComplete).toBe(true)
    expect(result.overallFivePointScore).toBeCloseTo(3.25)
  })

  it('任一维度没有有效样本时保留该维度待评且不生成总分', async () => {
    const missingDimensionId = role.dimensions[0].id
    repository.submissions.clear()
    repository.submissions.set(
      'submission-peer-1',
      makeSubmission('submission-peer-1', 'peer-1', 80, missingDimensionId),
    )

    const result = await service.calculateParticipant('batch-1', 'participant-1')

    expect(result.dimensions[0].fivePointScore).toBeNull()
    expect(result.dimensions[1].fivePointScore).toBe(4)
    expect(result.isComplete).toBe(false)
    expect(result.overallFivePointScore).toBeNull()
  })

  it('关闭开放批次并为每位被评人生成不可变结果快照', async () => {
    const snapshots = await service.closeBatch('batch-1')

    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]).toMatchObject({
      id: 'snapshot-1',
      participantId: 'participant-1',
      snapshotVersion: 1,
      status: 'active',
      isComplete: true,
    })
    expect((await repository.getBatch('batch-1'))?.status).toBe('closed')
    expect(repository.activeBatches.has(role.id)).toBe(false)
  })

  it('重新开放批次时让旧快照失效，下一次关闭生成新版本', async () => {
    await service.closeBatch('batch-1')
    await service.reopenBatch('batch-1')

    expect((await repository.listResultSnapshots('batch-1'))[0].status).toBe('invalidated')

    const snapshots = await service.closeBatch('batch-1')
    expect(snapshots[0].snapshotVersion).toBe(2)
  })

  it('关闭批次不允许作废答卷；重开后可作废并恢复任务为待填写', async () => {
    await service.closeBatch('batch-1')
    await expect(service.voidSubmission('submission-peer-1', '管理员确认重复提交')).rejects.toMatchObject({ code: 'BATCH_CLOSED' })

    await service.reopenBatch('batch-1')
    await expect(service.voidSubmission('submission-peer-1', '管理员确认重复提交')).resolves.toEqual({
      id: 'submission-peer-1',
      status: 'voided',
    })
    expect(repository.submissions.get('submission-peer-1')?.voidReason).toBe('管理员确认重复提交')
    expect(repository.assignments.get('peer-1')).toMatchObject({ status: 'pending', currentSubmissionId: null })
  })
})
