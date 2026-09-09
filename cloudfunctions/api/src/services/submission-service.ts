import { ANSWER_CODES, type AnswerCode, type QuestionBankRole } from '../../../../shared/question-bank/schema'
import { calculateIndividualDimensionScores } from '../../../../shared/scoring/questionnaire-score'
import { getRole } from '../question-bank-store'
import type { PublicRepository, SubmissionRecord } from '../repositories/contracts'
import { ApiError, badRequest } from '../http/errors'
import { verifyTaskToken } from '../security/task-token'

export interface SubmitQuestionnaireInput {
  token: string
  idempotencyKey: string
  answers: Record<string, unknown>
}

export interface SubmissionServiceDependencies {
  repository: PublicRepository
  taskTokenSecret: string
  now: () => Date
}

function validateAnswers(role: QuestionBankRole, raw: Record<string, unknown>): Record<string, AnswerCode> {
  const questionIds = role.dimensions.flatMap((dimension) => dimension.questions.map((question) => question.id))
  if (Object.keys(raw).length !== questionIds.length) throw badRequest('请为全部30道题明确选择一个答案')
  const allowed = new Set<string>(ANSWER_CODES)
  const answers: Record<string, AnswerCode> = {}
  for (const questionId of questionIds) {
    const answer = raw[questionId]
    if (typeof answer !== 'string' || !allowed.has(answer)) throw badRequest('答案格式不正确')
    answers[questionId] = answer as AnswerCode
  }
  if (Object.keys(raw).some((questionId) => !questionIds.includes(questionId))) throw badRequest('答案包含未知题目')
  return answers
}

export class SubmissionService {
  constructor(private readonly dependencies: SubmissionServiceDependencies) {}

  async submit(input: SubmitQuestionnaireInput) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.idempotencyKey)) {
      throw badRequest('提交请求编号无效')
    }
    const now = this.dependencies.now()
    const payload = verifyTaskToken(input.token, this.dependencies.taskTokenSecret, now.getTime())
    const assignment = await this.dependencies.repository.getAssignment(payload.assignmentId)
    if (!assignment || assignment.batchId !== payload.batchId) throw new ApiError(409, 'TASK_NOT_AVAILABLE', '该评价任务当前不可提交')
    const participant = await this.dependencies.repository.getParticipant(assignment.participantId)
    if (!participant || participant.status !== 'active') throw new ApiError(409, 'TASK_NOT_AVAILABLE', '该评价任务当前不可提交')
    const batch = await this.dependencies.repository.findOpenBatchByRole(participant.roleIdSnapshot, now.toISOString())
    if (!batch || batch.id !== assignment.batchId || batch.questionnaireVersionId !== payload.questionnaireVersionId) {
      throw new ApiError(409, 'BATCH_CLOSED', '本次评估已经结束，暂时不能提交')
    }
    const role = getRole(batch.roleId)
    if (!role) throw new ApiError(409, 'TASK_NOT_AVAILABLE', '该评价任务当前不可提交')
    const answers = validateAnswers(role, input.answers)
    const dimensionScores = calculateIndividualDimensionScores(role, answers)
    if (!dimensionScores.some((dimension) => dimension.percentageScore !== null)) {
      throw badRequest('至少需要一个维度有3道可计分答案')
    }
    const submission: SubmissionRecord = {
      // A UUID idempotency key is also the document ID. This makes retries and
      // concurrent submissions resolve through one transactional document.
      id: input.idempotencyKey,
      assignmentId: assignment.id,
      batchId: batch.id,
      participantId: participant.id,
      questionnaireVersionId: payload.questionnaireVersionId,
      scoringVersion: 'behavior-scale-v1',
      answers,
      dimensionScores,
      idempotencyKey: input.idempotencyKey,
      status: 'active',
      submittedAt: now.toISOString(),
    }
    const result = await this.dependencies.repository.createSubmissionAtomic({ submission, expectedAssignmentStatus: 'pending' })
    if (result.status === 'already-submitted') throw new ApiError(409, 'ALREADY_SUBMITTED', '该评价任务已经提交，如需重填请联系管理员')
    if (result.status === 'not-found') throw new ApiError(409, 'TASK_NOT_AVAILABLE', '该评价任务当前不可提交')
    const stored = result.submission
    return {
      status: 'submitted' as const,
      evaluatee: { name: participant.nameSnapshot },
      role: { id: role.id, name: role.name },
      submittedAt: stored.submittedAt,
    }
  }
}
