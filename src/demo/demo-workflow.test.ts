import { describe, expect, it } from 'vitest'
import { QUESTION_BANK } from '../../shared/question-bank/load'
import type { AnswerCode } from '../../shared/question-bank/schema'
import { DemoStore } from './demo-store'
import { MemoryAdminApi } from '../admin/admin-api'
import { MemoryQuestionnaireApi } from '../questionnaire/questionnaire-api'

function allAnswers(roleId: string, code: AnswerCode): Record<string, AnswerCode> {
  const role = QUESTION_BANK.roles.find((candidate) => candidate.id === roleId)!
  return Object.fromEntries(
    role.dimensions.flatMap((dimension) => dimension.questions.map((question) => [question.id, code])),
  )
}

describe('local demo workflow', () => {
  it('runs admin setup through questionnaire submission and admin results on a shared store', async () => {
    const store = new DemoStore()
    const admin = new MemoryAdminApi(store)
    await admin.login(MemoryAdminApi.demoPassword)

    const evaluatee = await admin.createPerson({ name: '王小明', department: '数字业务部', currentRoleId: 'sales', canBeEvaluatee: true, canBeRater: false })
    const rater = await admin.createPerson({ name: '张三', department: '销售部', currentRoleId: null, canBeEvaluatee: false, canBeRater: true })
    const batch = await admin.createBatch({
      name: '2026年第三季度评估',
      roleId: 'sales',
      assessmentDate: '2026-08-13',
      startsAt: '2026-08-01T00:00:00Z',
      deadlineAt: '2099-12-31T00:00:00Z',
    })
    const participant = await admin.addParticipant(batch.id, evaluatee.id)
    await admin.addAssignment(batch.id, participant.id, rater.id, 'superior')
    await admin.openBatch(batch.id)

    const questionnaire = new MemoryQuestionnaireApi(store)
    await expect(questionnaire.getQuestionnaire('sales')).resolves.toMatchObject({ batch: { id: batch.id } })
    const lookup = await questionnaire.lookupTasks('sales', '张三', '销售部')
    expect(lookup.tasks).toHaveLength(1)

    const form = await questionnaire.getTaskForm(lookup.tasks[0]!.token!)
    expect(form.role.id).toBe('sales')

    await questionnaire.submit({
      token: lookup.tasks[0]!.token!,
      idempotencyKey: '123e4567-e89b-42d3-a456-426614174000',
      answers: allAnswers('sales', 'D'),
    })

    const result = await admin.getParticipantResult(batch.id, participant.id)
    expect(result.overallFivePointScore).toBe(4)
    expect(result.isComplete).toBe(true)
    expect(result.submittedRaterCounts.superior).toBe(1)

    expect(await admin.listSubmissions(batch.id)).toHaveLength(1)
    expect((await admin.exportBatch(batch.id)).contentType).toBe('text/csv')
  })

  it('supports void, re-submission, close and reopen', async () => {
    const store = new DemoStore()
    const admin = new MemoryAdminApi(store)
    await admin.login(MemoryAdminApi.demoPassword)
    const evaluatee = await admin.createPerson({ name: '王小明', department: '数字业务部', currentRoleId: 'sales', canBeEvaluatee: true, canBeRater: false })
    const rater = await admin.createPerson({ name: '张三', department: '销售部', currentRoleId: null, canBeEvaluatee: false, canBeRater: true })
    const batch = await admin.createBatch({ name: '批次', roleId: 'sales', assessmentDate: '2026-08-13', startsAt: '2026-08-01T00:00:00Z', deadlineAt: '2099-12-31T00:00:00Z' })
    const participant = await admin.addParticipant(batch.id, evaluatee.id)
    await admin.addAssignment(batch.id, participant.id, rater.id, 'superior')
    await admin.openBatch(batch.id)

    const questionnaire = new MemoryQuestionnaireApi(store)
    const lookup = await questionnaire.lookupTasks('sales', '张三', '销售部')
    const token = lookup.tasks[0]!.token!
    await questionnaire.submit({ token, idempotencyKey: '123e4567-e89b-42d3-a456-426614174001', answers: allAnswers('sales', 'D') })

    const submissionId = (await admin.listSubmissions(batch.id))[0]!.id
    await admin.voidSubmission(submissionId, '填错，允许重填')
    expect((await admin.listSubmissions(batch.id))[0]).toMatchObject({ status: 'voided' })

    await questionnaire.submit({ token, idempotencyKey: '123e4567-e89b-42d3-a456-426614174002', answers: allAnswers('sales', 'E') })
    expect((await admin.listSubmissions(batch.id)).filter((submission) => submission.status === 'active')).toHaveLength(1)

    await admin.closeBatch(batch.id)
    expect((await admin.getBatchDetails(batch.id)).batch.status).toBe('closed')
    await admin.reopenBatch(batch.id)
    expect((await admin.getBatchDetails(batch.id)).batch.status).toBe('open')
  })
})
