import type { AnswerCode, QuestionBank } from '../../../../shared/question-bank/schema'
import type { IndividualDimensionScore, RaterLevel } from '../../../../shared/domain/types'

export interface PersonRecord {
  id: string
  name: string
  normalizedName: string
  department: string
  normalizedDepartment: string
  currentRoleId: string | null
  canBeEvaluatee: boolean
  canBeRater: boolean
  status: 'active' | 'inactive'
}

export interface BatchRecord {
  id: string
  name: string
  roleId: string
  questionnaireVersionId: string
  assessmentDate: string
  startsAt: string
  deadlineAt: string
  status: 'draft' | 'open' | 'closed' | 'archived'
}

export interface RoleActiveBatchRecord {
  roleId: string
  batchId: string
  openedAt: string
}

export interface ParticipantRecord {
  id: string
  batchId: string
  personId: string
  nameSnapshot: string
  departmentSnapshot: string
  roleIdSnapshot: string
  status: 'active' | 'removed'
}

export interface AssignmentRecord {
  id: string
  batchId: string
  participantId: string
  raterPersonId: string
  raterNameSnapshot: string
  raterDepartmentSnapshot: string
  normalizedRaterName: string
  normalizedRaterDepartment: string
  level: RaterLevel
  status: 'pending' | 'submitted' | 'cancelled'
  currentSubmissionId: string | null
  submittedAt: string | null
}

export interface SubmissionRecord {
  id: string
  assignmentId: string
  batchId: string
  participantId: string
  questionnaireVersionId: string
  scoringVersion: string
  answers: Record<string, AnswerCode>
  dimensionScores: IndividualDimensionScore[]
  idempotencyKey: string
  status: 'active' | 'voided'
  submittedAt: string
  voidedAt?: string | null
  voidReason?: string | null
}

export interface ResultSnapshotRecord {
  id: string
  batchId: string
  participantId: string
  snapshotVersion: number
  status: 'active' | 'invalidated'
  dimensions: Array<{
    dimensionId: string
    name: string
    percentageScore: number | null
    fivePointScore: number | null
    validRaterCount: number
    levels: Partial<Record<RaterLevel, { validRaterCount: number; percentageMean: number }>>
  }>
  isComplete: boolean
  overallFivePointScore: number | null
  submittedRaterCounts: Record<RaterLevel, number>
  sourceSubmissionIds: string[]
  createdAt: string
}

export interface CreateSubmissionInput {
  submission: SubmissionRecord
  expectedAssignmentStatus: 'pending'
}

export type CreateSubmissionResult =
  | { status: 'created'; submission: SubmissionRecord }
  | { status: 'idempotent-replay'; submission: SubmissionRecord }
  | { status: 'already-submitted'; submittedAt: string | null }
  | { status: 'not-found' }

export interface SubmissionRepository {
  createSubmissionAtomic(input: CreateSubmissionInput): Promise<CreateSubmissionResult>
}

export interface PublicAssessmentRepository {
  findOpenBatchByRole(roleId: string, now: string): Promise<BatchRecord | null>
  findAssignmentsByIdentity(
    batchId: string,
    normalizedName: string,
    normalizedDepartment: string,
  ): Promise<AssignmentRecord[]>
  getParticipant(participantId: string): Promise<ParticipantRecord | null>
  getAssignment(assignmentId: string): Promise<AssignmentRecord | null>
}

export type PublicRepository = PublicAssessmentRepository & SubmissionRepository

export interface AdminSessionRecord {
  id: string
  csrfTokenHash: string
  createdAt: string
  expiresAt: string
  revokedAt: string | null
}

export interface AdminSessionRepository {
  createSession(session: AdminSessionRecord): Promise<void>
  getSession(sessionId: string): Promise<AdminSessionRecord | null>
  updateCsrfTokenHash(sessionId: string, csrfTokenHash: string): Promise<void>
  revokeSession(sessionId: string, revokedAt: string): Promise<void>
}

export interface ManagementRepository {
  listPeople(): Promise<PersonRecord[]>
  listBatches(): Promise<BatchRecord[]>
  getPerson(personId: string): Promise<PersonRecord | null>
  savePerson(person: PersonRecord): Promise<void>
  deletePerson(personId: string): Promise<void>
  getBatch(batchId: string): Promise<BatchRecord | null>
  saveBatch(batch: BatchRecord): Promise<void>
  listParticipants(batchId: string): Promise<ParticipantRecord[]>
  saveParticipant(participant: ParticipantRecord): Promise<void>
  listAssignments(batchId: string): Promise<AssignmentRecord[]>
  saveAssignment(assignment: AssignmentRecord): Promise<void>
  openBatchAtomic(batchId: string, roleId: string, openedAt: string): Promise<'opened' | 'role-already-open' | 'not-found' | 'invalid-status'>
  deleteBatchCascade(batchId: string): Promise<'deleted' | 'not-found'>
}

export interface ResultsRepository {
  listBatches(): Promise<BatchRecord[]>
  getBatch(batchId: string): Promise<BatchRecord | null>
  listParticipants(batchId: string): Promise<ParticipantRecord[]>
  listAssignments(batchId: string): Promise<AssignmentRecord[]>
  listSubmissions(batchId: string, participantId?: string): Promise<SubmissionRecord[]>
  listResultSnapshots(batchId: string, participantId?: string): Promise<ResultSnapshotRecord[]>
  closeBatchAtomic(batchId: string, snapshots: ResultSnapshotRecord[], closedAt: string): Promise<'closed' | 'not-found' | 'invalid-status'>
  reopenBatchAtomic(batchId: string, reopenedAt: string): Promise<'reopened' | 'role-already-open' | 'not-found' | 'invalid-status'>
  voidSubmissionAtomic(submissionId: string, reason: string, voidedAt: string): Promise<'voided' | 'not-found' | 'batch-closed' | 'already-voided'>
}

export interface AuditLogRecord {
  id: string
  action: string
  targetType: string
  targetId: string
  actorSessionId: string
  requestId: string
  outcome: 'success' | 'failure'
  errorCode: string | null
  createdAt: string
}

export interface AuditRepository {
  appendAuditLog(record: AuditLogRecord): Promise<void>
}

export interface AdminPasswordRecord {
  id: 'admin_password'
  saltHex: string
  hashHex: string
  updatedAt: string
}

export interface AdminSettingsRepository {
  getAdminPassword(): Promise<AdminPasswordRecord | null>
  saveAdminPassword(record: AdminPasswordRecord): Promise<void>
  getQuestionBank(): Promise<QuestionBank | null>
  saveQuestionBank(bank: QuestionBank): Promise<void>
}
