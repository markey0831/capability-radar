import { QUESTION_BANK } from '../../shared/question-bank/load'
import { normalizeRaterIdentity } from '../../shared/identity/normalize-identity'
import { calculateIndividualDimensionScores } from '../../shared/scoring/questionnaire-score'
import type { RaterLevel } from '../../shared/domain/types'
import { ApiClient, ApiError } from '../app/api-client'
import { DemoStore } from '../demo/demo-store'
import type { DemoAssignment, DemoSubmission } from '../demo/demo-store'
import type {
  QuestionnaireApi,
  QuestionnaireInfo,
  SubmitInput,
  SubmitResult,
  TaskForm,
  TaskLookupResult,
  VisibleTask,
} from './types'

export class HttpQuestionnaireApi implements QuestionnaireApi {
  private readonly client: ApiClient

  constructor(client: ApiClient) {
    this.client = client
  }

  getQuestionnaire(roleCode: string): Promise<QuestionnaireInfo> {
    return this.client.get(`/public/questionnaire/${encodeURIComponent(roleCode)}`)
  }

  lookupTasks(roleCode: string, name: string, department: string): Promise<TaskLookupResult> {
    return this.client.post('/public/tasks/lookup', { roleId: roleCode, name, department })
  }

  getTaskForm(token: string): Promise<TaskForm> {
    return this.client.post('/public/tasks/form', { token })
  }

  submit(input: SubmitInput): Promise<SubmitResult> {
    return this.client.post('/public/submissions', input)
  }
}

export class MemoryQuestionnaireApi implements QuestionnaireApi {
  private readonly store: DemoStore
  private readonly now: () => Date

  constructor(store: DemoStore, now: () => Date = () => new Date()) {
    this.store = store
    this.now = now
  }

  async getQuestionnaire(roleCode: string): Promise<QuestionnaireInfo> {
    const role = this.requireRole(roleCode)
    const batch = this.findOpenBatch(role.id, this.now())
    return {
      role: { id: role.id, name: role.name },
      batch: batch
        ? { id: batch.id, name: batch.name, assessmentDate: batch.assessmentDate, deadlineAt: batch.deadlineAt }
        : null,
      questionnaireVersion: QUESTION_BANK.version,
      anonymityNotice: '您的姓名仅供管理员核对完成情况，不会向被评估人展示，也不会出现在能力图或最终报告中。',
    }
  }

  async lookupTasks(roleCode: string, name: string, department: string): Promise<TaskLookupResult> {
    const role = this.requireRole(roleCode)
    const batch = this.findOpenBatch(role.id, this.now())
    if (!batch) throw new ApiError(404, 'NO_ASSIGNMENTS', '未找到待评价任务')
    const identity = normalizeRaterIdentity(name, department)
    const assignments = this.store.listAssignments(batch.id).filter((assignment) =>
      assignment.status !== 'cancelled'
      && assignment.normalizedRaterName === identity.normalizedName
      && assignment.normalizedRaterDepartment === identity.normalizedDepartment,
    )
    if (assignments.length === 0) throw new ApiError(404, 'NO_ASSIGNMENTS', '未找到待评价任务')
    const tasks: VisibleTask[] = assignments.map((assignment) => {
      const participant = this.store.listParticipants(batch.id).find((candidate) => candidate.id === assignment.participantId)
      return {
        taskId: assignment.id,
        token: assignment.status === 'pending' ? `demo:${assignment.id}` : null,
        status: assignment.status,
        submittedAt: assignment.submittedAt,
        level: assignment.level as RaterLevel,
        evaluatee: { name: participant?.nameSnapshot ?? '', department: participant?.departmentSnapshot ?? '' },
      }
    })
    return {
      batch: { id: batch.id, name: batch.name, deadlineAt: batch.deadlineAt },
      role: { id: role.id, name: role.name },
      tasks,
    }
  }

  async getTaskForm(token: string): Promise<TaskForm> {
    const assignment = this.requireAssignmentByToken(token)
    const batch = this.requireOpenBatch(assignment)
    const participant = this.store.listParticipants(batch.id).find((candidate) => candidate.id === assignment.participantId)
    const role = this.requireRole(batch.roleId)
    return {
      task: { id: assignment.id, level: assignment.level, evaluatee: { name: participant?.nameSnapshot ?? '', department: participant?.departmentSnapshot ?? '' } },
      batch: { id: batch.id, name: batch.name, deadlineAt: batch.deadlineAt },
      role,
      questionnaireVersion: QUESTION_BANK.version,
    }
  }

  async submit(input: SubmitInput): Promise<SubmitResult> {
    const assignment = this.requireAssignmentByToken(input.token)
    const batch = this.requireOpenBatch(assignment)
    const participant = this.store.listParticipants(batch.id).find((candidate) => candidate.id === assignment.participantId)
    const role = this.requireRole(batch.roleId)
    const replay = this.store.findSubmissionByIdempotencyKey(input.idempotencyKey)
    if (replay) return this.successResult(replay, role.id, role.name, participant?.nameSnapshot ?? '')
    if (assignment.status === 'submitted' || assignment.currentSubmissionId) throw new ApiError(409, 'ALREADY_SUBMITTED', '该评价任务已经提交')
    const questionIds = role.dimensions.flatMap((dimension) => dimension.questions.map((question) => question.id))
    if (Object.keys(input.answers).length !== questionIds.length || questionIds.some((id) => input.answers[id] === undefined)) {
      throw new ApiError(400, 'BAD_REQUEST', '请为全部30道题明确选择一个答案')
    }
    const dimensionScores = calculateIndividualDimensionScores(role, input.answers)
    if (!dimensionScores.some((dimension) => dimension.percentageScore !== null)) {
      throw new ApiError(400, 'BAD_REQUEST', '至少需要一个维度有3道可计分答案')
    }
    const submittedAt = this.now().toISOString()
    const submission: DemoSubmission = {
      id: input.idempotencyKey,
      assignmentId: assignment.id,
      batchId: batch.id,
      participantId: assignment.participantId,
      questionnaireVersionId: QUESTION_BANK.version,
      scoringVersion: 'behavior-scale-v1',
      answers: input.answers,
      dimensionScores,
      idempotencyKey: input.idempotencyKey,
      status: 'active',
      submittedAt,
      voidReason: null,
      voidedAt: null,
    }
    this.store.saveSubmission(submission)
    this.store.saveAssignment({ ...assignment, status: 'submitted', currentSubmissionId: submission.id, submittedAt })
    return this.successResult(submission, role.id, role.name, participant?.nameSnapshot ?? '')
  }

  private successResult(submission: DemoSubmission, roleId: string, roleName: string, evaluateeName: string): SubmitResult {
    return {
      status: 'submitted',
      evaluatee: { name: evaluateeName },
      role: { id: roleId, name: roleName },
      submittedAt: submission.submittedAt,
    }
  }

  private requireRole(roleCode: string) {
    const role = QUESTION_BANK.roles.find((candidate) => candidate.id === roleCode)
    if (!role) throw new ApiError(404, 'NOT_FOUND', '未找到对应职位')
    return role
  }

  private findOpenBatch(roleId: string, now: Date) {
    const nowIso = now.toISOString()
    return this.store.listBatches().find((batch) =>
      batch.roleId === roleId
      && batch.status === 'open'
      && batch.startsAt <= nowIso
      && batch.deadlineAt > nowIso,
    ) ?? null
  }

  private requireAssignmentByToken(token: string): DemoAssignment {
    const prefix = 'demo:'
    if (!token.startsWith(prefix)) throw new ApiError(409, 'TASK_NOT_AVAILABLE', '该评价任务当前不可填写')
    const assignment = this.store.getAssignment(token.slice(prefix.length))
    if (!assignment || assignment.status === 'cancelled') throw new ApiError(409, 'TASK_NOT_AVAILABLE', '该评价任务当前不可填写')
    return assignment
  }

  private requireOpenBatch(assignment: DemoAssignment) {
    const batch = this.store.getBatch(assignment.batchId)
    if (!batch || batch.status !== 'open') throw new ApiError(409, 'BATCH_CLOSED', '本次评估已经结束，暂时不能提交')
    return batch
  }
}
