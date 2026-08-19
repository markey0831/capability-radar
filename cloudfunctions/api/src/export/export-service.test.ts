import { describe, expect, it } from 'vitest'
import { QUESTION_BANK } from '../../../../shared/question-bank/load'
import { calculateIndividualDimensionScores } from '../../../../shared/scoring/questionnaire-score'
import type { AnswerCode } from '../../../../shared/question-bank/schema'
import { MemoryManagementRepository } from '../repositories/memory/management-repository'
import { ResultService } from '../services/result-service'
import { buildAssessmentExportDataset } from './export-service'

const role = QUESTION_BANK.roles[0]
const answers = Object.fromEntries(
  role.dimensions.flatMap((dimension) => dimension.questions.map((question) => [question.id, 'D'])),
) as Record<string, AnswerCode>

const batchId = 'batch-1'
const participantId = 'participant-1'
const assignmentId = 'assignment-1'
const submissionId = 'submission-1'

describe('buildAssessmentExportDataset', () => {
  it('assembles summary, layered stats, submissions and task progress', async () => {
    const repository = new MemoryManagementRepository({
      batches: [{
        id: batchId,
        name: '2026年第三季度评估',
        roleId: role.id,
        questionnaireVersionId: QUESTION_BANK.version,
        assessmentDate: '2026-08-13',
        startsAt: '2026-08-01T00:00:00.000Z',
        deadlineAt: '2026-08-31T00:00:00.000Z',
        status: 'open',
      }],
      participants: [{
        id: participantId,
        batchId,
        personId: 'evaluatee-1',
        nameSnapshot: '张三',
        departmentSnapshot: '销售部',
        roleIdSnapshot: role.id,
        status: 'active',
      }],
      assignments: [{
        id: assignmentId,
        batchId,
        participantId,
        raterPersonId: 'rater-1',
        raterNameSnapshot: '李经理',
        raterDepartmentSnapshot: '业务中心',
        normalizedRaterName: '李经理',
        normalizedRaterDepartment: '业务中心',
        level: 'superior',
        status: 'submitted',
        currentSubmissionId: submissionId,
        submittedAt: '2026-08-14T08:00:00.000Z',
      }],
      submissions: [{
        id: submissionId,
        assignmentId,
        batchId,
        participantId,
        questionnaireVersionId: QUESTION_BANK.version,
        scoringVersion: 'behavior-scale-v1',
        answers,
        dimensionScores: calculateIndividualDimensionScores(role, answers),
        idempotencyKey: submissionId,
        status: 'active',
        submittedAt: '2026-08-14T08:00:00.000Z',
      }],
    })
    const resultService = new ResultService(repository, () => new Date('2026-08-15T00:00:00.000Z'))

    const dataset = await buildAssessmentExportDataset(batchId, { repository, resultService })

    expect(dataset.batch).toMatchObject({ name: '2026年第三季度评估', roleName: role.name })
    expect(dataset.dimensions).toHaveLength(6)
    expect(dataset.summary).toHaveLength(1)
    expect(dataset.summary[0]).toMatchObject({ personName: '张三', overallFivePointScore: 4 })
    expect(dataset.layered).toHaveLength(6)
    expect(dataset.submissions).toHaveLength(1)
    expect(dataset.submissions[0]).toMatchObject({ raterName: '李经理', evaluateeName: '张三', level: 'superior' })
    expect(dataset.taskProgress).toHaveLength(1)
    expect(dataset.taskProgress[0]).toMatchObject({ raterName: '李经理', status: '已提交' })
  })
})
