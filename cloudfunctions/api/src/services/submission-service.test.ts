import { describe, expect, it } from 'vitest'
import { QUESTION_BANK } from '../../../../shared/question-bank/load'
import type { AnswerCode } from '../../../../shared/question-bank/schema'
import { issueTaskToken } from '../security/task-token'
import { MemoryPublicRepository } from '../repositories/memory/public-repository'
import type { AssignmentRecord, BatchRecord, ParticipantRecord } from '../repositories/contracts'
import { SubmissionService } from './submission-service'

const NOW = new Date('2026-08-13T08:00:00.000Z')
const SECRET = 'test-task-token-secret-with-at-least-32-bytes'
const IDEMPOTENCY_KEY = '123e4567-e89b-42d3-a456-426614174000'

const batch: BatchRecord = {
  id: 'batch-1',
  name: '测试批次',
  roleId: 'sales',
  questionnaireVersionId: QUESTION_BANK.version,
  assessmentDate: '2026-08-13',
  startsAt: '2026-08-01T00:00:00.000Z',
  deadlineAt: '2026-08-31T15:59:59.000Z',
  status: 'open',
}

const participant: ParticipantRecord = {
  id: 'participant-1', batchId: batch.id, personId: 'evaluatee-1', nameSnapshot: '张三',
  departmentSnapshot: '销售部', roleIdSnapshot: 'sales', status: 'active',
}

const assignment: AssignmentRecord = {
  id: 'assignment-1', batchId: batch.id, participantId: participant.id, raterPersonId: 'rater-1',
  raterNameSnapshot: '李经理', raterDepartmentSnapshot: '业务中心', normalizedRaterName: '李经理',
  normalizedRaterDepartment: '业务中心', level: 'superior', status: 'pending', currentSubmissionId: null, submittedAt: null,
}

function allAnswers(answer: AnswerCode): Record<string, AnswerCode> {
  return Object.fromEntries(
    QUESTION_BANK.roles[0]!.dimensions.flatMap((dimension) => dimension.questions.map((question) => [question.id, answer])),
  )
}

function createFixture(seed: { batch?: BatchRecord; assignment?: AssignmentRecord } = {}) {
  const repository = new MemoryPublicRepository({
    batches: [seed.batch ?? batch],
    participants: [participant],
    assignments: [seed.assignment ?? assignment],
  })
  const service = new SubmissionService({
    repository,
    taskTokenSecret: SECRET,
    now: () => NOW,
  })
  const token = issueTaskToken({
    assignmentId: assignment.id,
    batchId: batch.id,
    questionnaireVersionId: QUESTION_BANK.version,
    expiresAt: NOW.getTime() + 60_000,
  }, SECRET)
  return { repository, service, token }
}

describe('submission service', () => {
  it('rejects missing answers and a questionnaire with no valid dimension', async () => {
    const { service, token } = createFixture()
    await expect(service.submit({ token, idempotencyKey: IDEMPOTENCY_KEY, answers: {} })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(service.submit({ token, idempotencyKey: IDEMPOTENCY_KEY, answers: allAnswers('UNABLE') })).rejects.toMatchObject({
      message: '至少需要一个维度有3道可计分答案',
    })
  })

  it('recalculates and stores scores on the server', async () => {
    const { repository, service, token } = createFixture()
    const result = await service.submit({ token, idempotencyKey: IDEMPOTENCY_KEY, answers: allAnswers('D') })
    expect(result).toEqual({
      status: 'submitted', evaluatee: { name: '张三' }, role: { id: 'sales', name: '销售' }, submittedAt: NOW.toISOString(),
    })
    const stored = [...repository.submissions.values()][0]
    expect(stored?.dimensionScores.every((score) => score.fivePointScore === 4)).toBe(true)
    expect(repository.assignments.get(assignment.id)).toMatchObject({ status: 'submitted', currentSubmissionId: IDEMPOTENCY_KEY })
    expect(JSON.stringify(result)).not.toContain('dimensionScores')
    expect(JSON.stringify(result)).not.toContain('李经理')
  })

  it('returns the original result for an idempotent retry and rejects a different retry key', async () => {
    const { repository, service, token } = createFixture()
    const first = await service.submit({ token, idempotencyKey: IDEMPOTENCY_KEY, answers: allAnswers('D') })
    const replay = await service.submit({ token, idempotencyKey: IDEMPOTENCY_KEY, answers: allAnswers('D') })
    expect(replay).toEqual(first)
    expect(repository.submissions.size).toBe(1)
    await expect(service.submit({
      token,
      idempotencyKey: '223e4567-e89b-42d3-a456-426614174000',
      answers: allAnswers('D'),
    })).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED' })
  })

  it('allows only one winner for concurrent submissions', async () => {
    const { repository, token } = createFixture()
    const service1 = new SubmissionService({ repository, taskTokenSecret: SECRET, now: () => NOW })
    const service2 = new SubmissionService({ repository, taskTokenSecret: SECRET, now: () => NOW })
    const results = await Promise.allSettled([
      service1.submit({ token, idempotencyKey: IDEMPOTENCY_KEY, answers: allAnswers('E') }),
      service2.submit({ token, idempotencyKey: '223e4567-e89b-42d3-a456-426614174000', answers: allAnswers('A') }),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(repository.submissions.size).toBe(1)
  })

  it('rejects a submission after the deadline even with a previously issued token', async () => {
    const { repository, token } = createFixture()
    const service = new SubmissionService({ repository, taskTokenSecret: SECRET, now: () => new Date('2026-09-01T00:00:00.000Z') })
    await expect(service.submit({ token, idempotencyKey: IDEMPOTENCY_KEY, answers: allAnswers('D') })).rejects.toMatchObject({
      code: 'EXPIRED_TASK_TOKEN',
    })
    expect(repository.submissions.size).toBe(0)
  })
})
