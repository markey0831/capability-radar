import { describe, expect, it } from 'vitest'
import { QUESTION_BANK } from '../../shared/question-bank/load'
import type { AnswerCode } from '../../shared/question-bank/schema'
import { DemoStore } from '../demo/demo-store'
import type { DemoAssignment, DemoBatch, DemoParticipant } from '../demo/demo-store'
import { MemoryQuestionnaireApi } from './questionnaire-api'

function seed(roleId: string) {
  const store = new DemoStore()
  const batch: DemoBatch = {
    id: 'batch-1',
    name: '测试批次',
    roleId,
    questionnaireVersionId: QUESTION_BANK.version,
    assessmentDate: '2026-08-13',
    startsAt: '2026-08-01T00:00:00.000Z',
    deadlineAt: '2099-12-31T00:00:00.000Z',
    status: 'open',
  }
  store.saveBatch(batch)
  const participant: DemoParticipant = {
    id: 'participant-1',
    batchId: batch.id,
    personId: 'evaluatee-1',
    nameSnapshot: '王小明',
    departmentSnapshot: '数字业务部',
    roleIdSnapshot: roleId,
    status: 'active',
  }
  store.saveParticipant(participant)
  const assignment: DemoAssignment = {
    id: 'assignment-1',
    batchId: batch.id,
    participantId: participant.id,
    raterPersonId: 'rater-1',
    raterNameSnapshot: '张三',
    raterDepartmentSnapshot: '销售部',
    normalizedRaterName: '张三',
    normalizedRaterDepartment: '销售部',
    level: 'superior',
    status: 'pending',
    currentSubmissionId: null,
    submittedAt: null,
  }
  store.saveAssignment(assignment)
  return { store, api: new MemoryQuestionnaireApi(store), assignment }
}

function allAnswers(roleId: string, code: AnswerCode): Record<string, AnswerCode> {
  const role = QUESTION_BANK.roles.find((candidate) => candidate.id === roleId)!
  return Object.fromEntries(
    role.dimensions.flatMap((dimension) => dimension.questions.map((question) => [question.id, code])),
  )
}

describe('MemoryQuestionnaireApi', () => {
  it('returns the correct six-dimension form for every role', async () => {
    for (const role of QUESTION_BANK.roles) {
      const { api, assignment } = seed(role.id)
      const form = await api.getTaskForm(`demo:${assignment.id}`)
      expect(form.role.id).toBe(role.id)
      expect(form.role.dimensions).toHaveLength(6)
    }
  })

  it('looks up tasks by normalized identity and rejects a wrong identity', async () => {
    const { api } = seed('sales')
    await expect(api.lookupTasks('sales', '张三', '销售部')).resolves.toMatchObject({ tasks: [{ taskId: 'assignment-1' }] })
    await expect(api.lookupTasks('sales', '李四', '销售部')).rejects.toMatchObject({ code: 'NO_ASSIGNMENTS' })
  })

  it('submits answers and marks the assignment submitted', async () => {
    const { store, api, assignment } = seed('sales')
    const result = await api.submit({
      token: `demo:${assignment.id}`,
      idempotencyKey: '123e4567-e89b-42d3-a456-426614174000',
      answers: allAnswers('sales', 'D'),
    })
    expect(result.status).toBe('submitted')
    expect(store.getAssignment(assignment.id)).toMatchObject({ status: 'submitted', currentSubmissionId: '123e4567-e89b-42d3-a456-426614174000' })
    await expect(api.submit({
      token: `demo:${assignment.id}`,
      idempotencyKey: '223e4567-e89b-42d3-a456-426614174000',
      answers: allAnswers('sales', 'D'),
    })).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED' })
  })
})
