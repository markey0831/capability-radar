import { describe, expect, it } from 'vitest'
import { MemoryPublicRepository } from '../repositories/memory/public-repository'
import type { AssignmentRecord, BatchRecord, ParticipantRecord } from '../repositories/contracts'
import { PublicQuestionnaireService } from './public-service'

const NOW = new Date('2026-08-13T08:00:00.000Z')
const SECRET = 'test-task-token-secret-with-at-least-32-bytes'

const batch: BatchRecord = {
  id: 'batch-1',
  name: '2026年第三季度销售能力评估',
  roleId: 'sales',
  questionnaireVersionId: '2026.08.13-v1',
  assessmentDate: '2026-08-13',
  startsAt: '2026-08-01T00:00:00.000Z',
  deadlineAt: '2026-08-31T15:59:59.000Z',
  status: 'open',
}

const participant: ParticipantRecord = {
  id: 'participant-1',
  batchId: batch.id,
  personId: 'person-evaluatee-1',
  nameSnapshot: '张三',
  departmentSnapshot: '销售部',
  roleIdSnapshot: 'sales',
  status: 'active',
}

const assignment: AssignmentRecord = {
  id: 'assignment-1',
  batchId: batch.id,
  participantId: participant.id,
  raterPersonId: 'person-rater-1',
  raterNameSnapshot: '李经理',
  raterDepartmentSnapshot: '业务中心 XR组',
  normalizedRaterName: '李经理',
  normalizedRaterDepartment: '业务中心 XR组',
  level: 'superior',
  status: 'pending',
  currentSubmissionId: null,
  submittedAt: null,
}

function createService(seed = {}) {
  const repository = new MemoryPublicRepository({
    batches: [batch],
    participants: [participant],
    assignments: [assignment],
    ...seed,
  })
  return new PublicQuestionnaireService({
    repository,
    taskTokenSecret: SECRET,
    now: () => NOW,
    tokenTtlMs: 30 * 60 * 1000,
  })
}

describe('public questionnaire service', () => {
  it('returns only public batch metadata before identity lookup', async () => {
    const result = await createService().getQuestionnaire('sales')
    expect(result.batch?.name).toBe(batch.name)
    expect(JSON.stringify(result)).not.toContain('李经理')
    expect(JSON.stringify(result)).not.toContain('assignment-1')
    expect(JSON.stringify(result)).not.toContain('score')
  })

  it('matches normalized name and department and returns only that rater tasks', async () => {
    const result = await createService().lookupTasks('sales', '　李经理 ', ' 业务中心　XR组 ')
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0]).toMatchObject({
      taskId: assignment.id,
      status: 'pending',
      level: 'superior',
      evaluatee: { name: '张三', department: '销售部' },
    })
    expect(result.tasks[0]?.token).toEqual(expect.any(String))
    expect(JSON.stringify(result)).not.toContain('raterPersonId')
  })

  it('uses the same public error for an unknown name, department, role, or no open batch', async () => {
    const service = createService()
    for (const [role, name, department] of [
      ['sales', '不存在', '业务中心'],
      ['sales', '李经理', '错误部门'],
      ['unknown', '李经理', '业务中心 XR组'],
    ]) {
      await expect(service.lookupTasks(role!, name!, department!)).rejects.toMatchObject({
        code: 'NO_ASSIGNMENTS',
        message: '未找到待评价任务',
      })
    }
    const closed = { ...batch, status: 'closed' as const }
    await expect(createService({ batches: [closed] }).lookupTasks('sales', '李经理', '业务中心 XR组')).rejects.toMatchObject({
      code: 'NO_ASSIGNMENTS',
      message: '未找到待评价任务',
    })
  })

  it('returns questions only through a valid task token', async () => {
    const service = createService()
    const lookup = await service.lookupTasks('sales', '李经理', '业务中心 XR组')
    const form = await service.getTaskForm(lookup.tasks[0]!.token!)
    expect(form.role.dimensions).toHaveLength(6)
    expect(form.role.dimensions.flatMap((dimension) => dimension.questions)).toHaveLength(30)
    await expect(service.getTaskForm(`${lookup.tasks[0]!.token}x`)).rejects.toMatchObject({ code: 'INVALID_TASK_TOKEN' })
  })
})
