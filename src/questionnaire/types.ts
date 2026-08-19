import type { AnswerCode, QuestionBankRole } from '../../shared/question-bank/schema'
import type { RaterLevel } from '../../shared/domain/types'

export interface QuestionnaireRoleSummary {
  id: string
  name: string
}

export interface QuestionnaireBatchSummary {
  id: string
  name: string
  assessmentDate?: string
  deadlineAt: string
}

export interface QuestionnaireInfo {
  role: QuestionnaireRoleSummary
  batch: QuestionnaireBatchSummary | null
  questionnaireVersion: string
  anonymityNotice: string
}

export interface VisibleTask {
  taskId: string
  token: string | null
  status: 'pending' | 'submitted' | 'cancelled'
  submittedAt: string | null
  level: RaterLevel
  evaluatee: { name: string; department: string }
}

export interface TaskLookupResult {
  batch: QuestionnaireBatchSummary
  role: QuestionnaireRoleSummary
  tasks: VisibleTask[]
}

export interface TaskForm {
  task: {
    id: string
    level: RaterLevel
    evaluatee: { name: string; department: string }
  }
  batch: QuestionnaireBatchSummary
  role: QuestionBankRole
  questionnaireVersion: string
}

export interface SubmitInput {
  token: string
  idempotencyKey: string
  answers: Record<string, AnswerCode>
}

export interface SubmitResult {
  status: 'submitted'
  evaluatee: { name: string }
  role: { id: string; name: string }
  submittedAt: string
}

export interface QuestionnaireApi {
  getQuestionnaire(roleCode: string): Promise<QuestionnaireInfo>
  lookupTasks(roleCode: string, name: string, department: string): Promise<TaskLookupResult>
  getTaskForm(token: string): Promise<TaskForm>
  submit(input: SubmitInput): Promise<SubmitResult>
}
