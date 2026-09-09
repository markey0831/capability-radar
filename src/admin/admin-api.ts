import { QUESTION_BANK } from '../../shared/question-bank/load'
import type { RaterLevel } from '../../shared/domain/types'
import type { QuestionBank, QuestionBankRole } from '../../shared/question-bank/schema'
import { calculateQuestionnaireAssessment } from '../../shared/scoring/questionnaire-score'
import { normalizeRaterIdentity } from '../../shared/identity/normalize-identity'
import { ApiClient, ApiError } from '../app/api-client'
import { DemoStore } from '../demo/demo-store'

export interface AdminRoleSummary {
  id: string
  code: string
  name: string
  dimensions: Array<{ id: string; name: string }>
}

export interface AdminPerson {
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

export interface AdminBatch {
  id: string
  name: string
  roleId: string
  questionnaireVersionId: string
  assessmentDate: string
  startsAt: string
  deadlineAt: string
  status: 'draft' | 'open' | 'closed' | 'archived'
}

export interface AdminParticipant {
  id: string
  batchId: string
  personId: string
  nameSnapshot: string
  departmentSnapshot: string
  roleIdSnapshot: string
  status: 'active' | 'removed'
}

export interface AdminAssignment {
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

export interface AdminSubmission {
  id: string
  assignmentId: string
  batchId: string
  participantId: string
  status: 'active' | 'voided'
  submittedAt: string
}

export interface AdminParticipantResult {
  participantId: string
  roleId: string
  dimensions: Array<{ dimensionId: string; name: string; fivePointScore: number | null; validRaterCount: number }>
  isComplete: boolean
  overallFivePointScore: number | null
  submittedRaterCounts: Record<RaterLevel, number>
}

export interface AdminBatchDetails {
  batch: AdminBatch
  participants: AdminParticipant[]
  assignments: AdminAssignment[]
}

export interface AdminExportFile {
  filename: string
  contentType: string
  data: string
}

export interface AdminPersonImportRow {
  name: string
  department: string
  currentRoleId: string | null
  canBeEvaluatee: boolean
  canBeRater: boolean
}

export interface AdminImportResult {
  imported: number
  errors: Array<{ row: number; message: string }>
}

export interface AdminSessionResponse {
  authenticated: boolean
  expiresAt: string
  csrfToken: string
}

export interface AdminLoginResponse {
  authenticated: true
  expiresAt: string
  csrfToken: string
}

export interface AdminApi {
  login(password: string): Promise<AdminLoginResponse>
  logout(): Promise<{ authenticated: false }>
  changePassword(currentPassword: string, newPassword: string): Promise<{ changed: true }>
  session(): Promise<AdminSessionResponse>
  listRoles(): Promise<AdminRoleSummary[]>
  listPeople(): Promise<AdminPerson[]>
  createPerson(input: {
    name: string
    department: string
    currentRoleId: string | null
    canBeEvaluatee: boolean
    canBeRater: boolean
  }): Promise<AdminPerson>
  updatePerson(person: AdminPerson, status: 'active' | 'inactive'): Promise<AdminPerson>
  deletePerson(personId: string): Promise<{ id: string; deleted: boolean; message?: string }>
  listBatches(): Promise<AdminBatch[]>
  createBatch(input: {
    name: string
    roleId: string
    assessmentDate: string
    startsAt: string
    deadlineAt: string
  }): Promise<AdminBatch>
  getBatchDetails(batchId: string): Promise<AdminBatchDetails>
  addParticipant(batchId: string, personId: string): Promise<AdminParticipant>
  addAssignment(batchId: string, participantId: string, raterPersonId: string, level: RaterLevel): Promise<AdminAssignment>
  openBatch(batchId: string): Promise<{ id: string; status: 'open' }>
  listSubmissions(batchId: string): Promise<AdminSubmission[]>
  getParticipantResult(batchId: string, participantId: string): Promise<AdminParticipantResult>
  voidSubmission(submissionId: string, reason: string): Promise<{ id: string; status: 'voided' }>
  closeBatch(batchId: string): Promise<{ id: string; status: 'closed' }>
  reopenBatch(batchId: string): Promise<{ id: string; status: 'open' }>
  extendBatch(batchId: string, deadlineAt: string): Promise<AdminBatch>
  archiveBatch(batchId: string): Promise<AdminBatch>
  copyBatch(sourceBatchId: string, input: {
    name: string
    assessmentDate: string
    startsAt: string
    deadlineAt: string
  }): Promise<{ batch: AdminBatch; copiedParticipants: number; copiedAssignments: number }>
  importPeople(rows: AdminPersonImportRow[]): Promise<AdminImportResult>
  exportBatch(batchId: string): Promise<AdminExportFile>
  getQuestionBank(): Promise<QuestionBank>
  saveQuestionBankRole(roleId: string, role: QuestionBankRole): Promise<{ updated: boolean }>
}

export class HttpAdminApi implements AdminApi {
  private readonly client: ApiClient

  constructor(client: ApiClient) {
    this.client = client
  }

  login(password: string): Promise<AdminLoginResponse> {
    return this.client.post('/admin/login', { password })
  }

  logout(): Promise<{ authenticated: false }> {
    return this.client.post('/admin/logout')
  }

  changePassword(currentPassword: string, newPassword: string): Promise<{ changed: true }> {
    return this.client.post('/admin/change-password', { currentPassword, newPassword })
  }

  session(): Promise<AdminSessionResponse> {
    return this.client.get('/admin/session')
  }

  listRoles(): Promise<AdminRoleSummary[]> {
    return this.client.get('/admin/roles')
  }

  listPeople(): Promise<AdminPerson[]> {
    return this.client.get('/admin/people')
  }

  createPerson(input: AdminPersonCreateInput): Promise<AdminPerson> {
    return this.client.post('/admin/people', input)
  }

  updatePerson(person: AdminPerson, status: 'active' | 'inactive'): Promise<AdminPerson> {
    return this.client.put(`/admin/people/${encodeURIComponent(person.id)}`, {
      name: person.name,
      department: person.department,
      currentRoleId: person.currentRoleId,
      status,
      canBeEvaluatee: person.canBeEvaluatee,
      canBeRater: person.canBeRater,
    })
  }

  deletePerson(personId: string): Promise<{ id: string; deleted: boolean; message?: string }> {
    return this.client.delete(`/admin/people/${encodeURIComponent(personId)}`)
  }

  listBatches(): Promise<AdminBatch[]> {
    return this.client.get('/admin/batches')
  }

  createBatch(input: AdminBatchCreateInput): Promise<AdminBatch> {
    return this.client.post('/admin/batches', input)
  }

  getBatchDetails(batchId: string): Promise<AdminBatchDetails> {
    return this.client.get(`/admin/batches/${encodeURIComponent(batchId)}`)
  }

  addParticipant(batchId: string, personId: string): Promise<AdminParticipant> {
    return this.client.post(`/admin/batches/${encodeURIComponent(batchId)}/participants`, { personId })
  }

  addAssignment(batchId: string, participantId: string, raterPersonId: string, level: RaterLevel): Promise<AdminAssignment> {
    return this.client.post(`/admin/batches/${encodeURIComponent(batchId)}/assignments`, { participantId, raterPersonId, level })
  }

  openBatch(batchId: string): Promise<{ id: string; status: 'open' }> {
    return this.client.post(`/admin/batches/${encodeURIComponent(batchId)}/open`)
  }

  async listSubmissions(batchId: string): Promise<AdminSubmission[]> {
    const response = await this.client.get<{ submissions: AdminSubmission[] }>(`/admin/batches/${encodeURIComponent(batchId)}/submissions`)
    return response.submissions
  }

  async getParticipantResult(batchId: string, participantId: string): Promise<AdminParticipantResult> {
    const response = await this.client.get<{ current: AdminParticipantResult }>(`/admin/batches/${encodeURIComponent(batchId)}/results/${encodeURIComponent(participantId)}`)
    return response.current
  }

  voidSubmission(submissionId: string, reason: string): Promise<{ id: string; status: 'voided' }> {
    return this.client.post(`/admin/submissions/${encodeURIComponent(submissionId)}/void`, { reason })
  }

  closeBatch(batchId: string): Promise<{ id: string; status: 'closed' }> {
    return this.client.post(`/admin/batches/${encodeURIComponent(batchId)}/close`)
  }

  reopenBatch(batchId: string): Promise<{ id: string; status: 'open' }> {
    return this.client.post(`/admin/batches/${encodeURIComponent(batchId)}/reopen`)
  }

  extendBatch(batchId: string, deadlineAt: string): Promise<AdminBatch> {
    return this.client.post(`/admin/batches/${encodeURIComponent(batchId)}/extend`, { deadlineAt })
  }

  archiveBatch(batchId: string): Promise<AdminBatch> {
    return this.client.post(`/admin/batches/${encodeURIComponent(batchId)}/archive`)
  }

  copyBatch(sourceBatchId: string, input: { name: string; assessmentDate: string; startsAt: string; deadlineAt: string }): Promise<{ batch: AdminBatch; copiedParticipants: number; copiedAssignments: number }> {
    return this.client.post(`/admin/batches/${encodeURIComponent(sourceBatchId)}/copy`, input)
  }

  async importPeople(rows: AdminPersonImportRow[]): Promise<AdminImportResult> {
    let imported = 0
    const errors: AdminImportResult['errors'] = []
    for (let index = 0; index < rows.length; index += 1) {
      try {
        await this.createPerson(rows[index])
        imported += 1
      } catch (error) {
        errors.push({ row: index + 1, message: error instanceof Error ? error.message : '导入失败' })
      }
    }
    return { imported, errors }
  }

  exportBatch(batchId: string): Promise<AdminExportFile> {
    return this.client.get(`/admin/batches/${encodeURIComponent(batchId)}/export`)
  }

  getQuestionBank(): Promise<QuestionBank> {
    return this.client.get('/admin/question-bank')
  }

  saveQuestionBankRole(roleId: string, role: QuestionBankRole): Promise<{ updated: boolean }> {
    return this.client.put(`/admin/question-bank/${encodeURIComponent(roleId)}`, { role })
  }
}

type AdminPersonCreateInput = Parameters<AdminApi['createPerson']>[0]
type AdminBatchCreateInput = Parameters<AdminApi['createBatch']>[0]

export class MemoryAdminApi implements AdminApi {
  static readonly demoPassword = 'admin123'

  private readonly store: DemoStore
  private loggedIn = false
  private csrfToken = 'demo-csrf-token'
  private password = MemoryAdminApi.demoPassword
  private bank: QuestionBank = QUESTION_BANK

  constructor(store: DemoStore = new DemoStore()) {
    this.store = store
  }

  async login(password: string): Promise<AdminLoginResponse> {
    if (password !== this.password) throw new ApiError(401, 'ADMIN_LOGIN_FAILED', '管理密码不正确')
    this.loggedIn = true
    this.csrfToken = 'demo-csrf-token'
    return { authenticated: true, expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), csrfToken: this.csrfToken }
  }

  async logout(): Promise<{ authenticated: false }> {
    this.loggedIn = false
    return { authenticated: false }
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<{ changed: true }> {
    this.requireAuth()
    if (currentPassword !== this.password) throw new ApiError(401, 'ADMIN_PASSWORD_INCORRECT', '当前密码不正确')
    if (newPassword.length < 12) throw new ApiError(400, 'BAD_REQUEST', '新密码至少需要12个字符')
    this.password = newPassword
    return { changed: true }
  }

  async session(): Promise<AdminSessionResponse> {
    if (!this.loggedIn) throw new ApiError(401, 'ADMIN_UNAUTHORIZED', '管理会话已失效，请重新登录')
    return { authenticated: true, expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), csrfToken: this.csrfToken }
  }

  async listRoles(): Promise<AdminRoleSummary[]> {
    this.requireAuth()
    return QUESTION_BANK.roles.map((role) => ({
      id: role.id,
      code: role.id,
      name: role.name,
      dimensions: role.dimensions.map((dimension) => ({ id: dimension.id, name: dimension.name })),
    }))
  }

  async listPeople(): Promise<AdminPerson[]> {
    this.requireAuth()
    return this.store.listPeople()
  }

  async createPerson(input: AdminPersonCreateInput): Promise<AdminPerson> {
    this.requireAuth()
    const identity = normalizeRaterIdentity(input.name, input.department)
    const person: AdminPerson = {
      id: this.store.nextId('person'),
      name: identity.displayName,
      normalizedName: identity.normalizedName,
      department: identity.displayDepartment,
      normalizedDepartment: identity.normalizedDepartment,
      currentRoleId: input.currentRoleId,
      canBeEvaluatee: input.canBeEvaluatee,
      canBeRater: input.canBeRater,
      status: 'active',
    }
    this.store.savePerson(person)
    return { ...person }
  }

  async updatePerson(person: AdminPerson, status: 'active' | 'inactive'): Promise<AdminPerson> {
    this.requireAuth()
    const existing = this.store.getPerson(person.id)
    if (!existing) throw new ApiError(404, 'NOT_FOUND', '人员不存在')
    const updated = { ...existing, status }
    this.store.savePerson(updated)
    return { ...updated }
  }

  async deletePerson(personId: string): Promise<{ id: string; deleted: boolean; message?: string }> {
    this.requireAuth()
    const existing = this.store.getPerson(personId)
    if (!existing) throw new ApiError(404, 'NOT_FOUND', '人员不存在')
    const referenced = [...this.store.participants.values()].some((participant) => participant.personId === personId)
      || [...this.store.assignments.values()].some((assignment) => assignment.raterPersonId === personId)
    if (referenced) {
      return { id: personId, deleted: false, message: '该人员已被批次引用，不能删除，请改用停用。' }
    }
    this.store.deletePerson(personId)
    return { id: personId, deleted: true }
  }

  async listBatches(): Promise<AdminBatch[]> {
    this.requireAuth()
    return this.store.listBatches()
  }

  async createBatch(input: AdminBatchCreateInput): Promise<AdminBatch> {
    this.requireAuth()
    const batch: AdminBatch = {
      id: this.store.nextId('batch'),
      name: input.name.trim(),
      roleId: input.roleId,
      questionnaireVersionId: QUESTION_BANK.version,
      assessmentDate: input.assessmentDate,
      startsAt: input.startsAt,
      deadlineAt: input.deadlineAt,
      status: 'draft',
    }
    this.store.saveBatch(batch)
    return { ...batch }
  }

  async getBatchDetails(batchId: string): Promise<AdminBatchDetails> {
    this.requireAuth()
    const batch = this.store.getBatch(batchId)
    if (!batch) throw new ApiError(404, 'NOT_FOUND', '批次不存在')
    return {
      batch: { ...batch },
      participants: this.store.listParticipants(batchId),
      assignments: this.store.listAssignments(batchId),
    }
  }

  async addParticipant(batchId: string, personId: string): Promise<AdminParticipant> {
    this.requireAuth()
    const batch = this.store.getBatch(batchId)
    if (!batch) throw new ApiError(404, 'NOT_FOUND', '批次不存在')
    if (batch.status !== 'draft') throw new ApiError(409, 'BATCH_NOT_EDITABLE', '只有草稿批次可以修改')
    const person = this.store.getPerson(personId)
    if (!person) throw new ApiError(400, 'BAD_REQUEST', '人员不存在')
    const participant: AdminParticipant = {
      id: this.store.nextId('participant'),
      batchId,
      personId,
      nameSnapshot: person.name,
      departmentSnapshot: person.department,
      roleIdSnapshot: batch.roleId,
      status: 'active',
    }
    this.store.saveParticipant(participant)
    return { ...participant }
  }

  async addAssignment(batchId: string, participantId: string, raterPersonId: string, level: RaterLevel): Promise<AdminAssignment> {
    this.requireAuth()
    const batch = this.store.getBatch(batchId)
    if (!batch) throw new ApiError(404, 'NOT_FOUND', '批次不存在')
    if (batch.status !== 'draft') throw new ApiError(409, 'BATCH_NOT_EDITABLE', '只有草稿批次可以修改')
    const participant = this.store.listParticipants(batchId).find((candidate) => candidate.id === participantId)
    const rater = this.store.getPerson(raterPersonId)
    if (!participant || !rater) throw new ApiError(400, 'BAD_REQUEST', '被评估人或评分人不存在')
    const assignment: AdminAssignment = {
      id: this.store.nextId('assignment'),
      batchId,
      participantId,
      raterPersonId,
      raterNameSnapshot: rater.name,
      raterDepartmentSnapshot: rater.department,
      normalizedRaterName: rater.normalizedName,
      normalizedRaterDepartment: rater.normalizedDepartment,
      level,
      status: 'pending',
      currentSubmissionId: null,
      submittedAt: null,
    }
    this.store.saveAssignment(assignment)
    return { ...assignment }
  }

  async openBatch(batchId: string): Promise<{ id: string; status: 'open' }> {
    this.requireAuth()
    const batch = this.store.getBatch(batchId)
    if (!batch) throw new ApiError(404, 'NOT_FOUND', '批次不存在')
    if (batch.status !== 'draft') throw new ApiError(409, 'BATCH_NOT_EDITABLE', '只有草稿批次可以开放')
    this.store.saveBatch({ ...batch, status: 'open' })
    return { id: batchId, status: 'open' }
  }

  async listSubmissions(batchId: string): Promise<AdminSubmission[]> {
    this.requireAuth()
    return this.store.listSubmissions(batchId).map((submission) => ({
      id: submission.id,
      assignmentId: submission.assignmentId,
      batchId: submission.batchId,
      participantId: submission.participantId,
      status: submission.status,
      submittedAt: submission.submittedAt,
    }))
  }

  async getParticipantResult(batchId: string, participantId: string): Promise<AdminParticipantResult> {
    this.requireAuth()
    const batch = this.store.getBatch(batchId)
    if (!batch) throw new ApiError(404, 'NOT_FOUND', '批次不存在')
    const participant = this.store.listParticipants(batchId).find((candidate) => candidate.id === participantId && candidate.status === 'active')
    if (!participant) throw new ApiError(404, 'NOT_FOUND', '被评估人不存在')
    const role = QUESTION_BANK.roles.find((candidate) => candidate.id === batch.roleId)
    if (!role) throw new Error(`题库中不存在职位：${batch.roleId}`)
    const assignments = this.store.listAssignments(batchId)
    const submissions = this.store.listSubmissions(batchId, participantId).filter((submission) => submission.status === 'active')
    const result = calculateQuestionnaireAssessment(
      role,
      batch.questionnaireVersionId,
      submissions.map((submission) => ({
        id: submission.id,
        level: assignments.find((assignment) => assignment.id === submission.assignmentId)?.level ?? 'peer',
        answers: submission.answers,
      })),
    )
    return {
      participantId,
      roleId: role.id,
      dimensions: result.dimensions.map((dimension) => ({
        dimensionId: dimension.dimensionId,
        name: dimension.name,
        fivePointScore: dimension.fivePointScore,
        validRaterCount: dimension.validRaterCount,
      })),
      isComplete: result.isComplete,
      overallFivePointScore: result.overallFivePointScore,
      submittedRaterCounts: result.submittedRaterCounts,
    }
  }

  async voidSubmission(submissionId: string, reason: string): Promise<{ id: string; status: 'voided' }> {
    this.requireAuth()
    const submission = this.store.getSubmission(submissionId)
    if (!submission) throw new ApiError(404, 'NOT_FOUND', '答卷不存在')
    if (submission.status === 'voided') throw new ApiError(409, 'ALREADY_VOIDED', '答卷已经作废')
    const batch = this.store.getBatch(submission.batchId)
    if (!batch || batch.status !== 'open') throw new ApiError(409, 'BATCH_CLOSED', '关闭批次不能作废答卷，请先重新开放')
    const assignment = this.store.getAssignment(submission.assignmentId)
    this.store.saveSubmission({
      ...submission,
      status: 'voided',
      voidReason: reason.trim(),
      voidedAt: new Date().toISOString(),
    })
    if (assignment?.currentSubmissionId === submission.id) {
      this.store.saveAssignment({ ...assignment, status: 'pending', currentSubmissionId: null, submittedAt: null })
    }
    return { id: submissionId, status: 'voided' }
  }

  async closeBatch(batchId: string): Promise<{ id: string; status: 'closed' }> {
    this.requireAuth()
    const batch = this.store.getBatch(batchId)
    if (!batch) throw new ApiError(404, 'NOT_FOUND', '批次不存在')
    if (batch.status !== 'open') throw new ApiError(409, 'BATCH_NOT_OPEN', '只有开放批次可以关闭')
    this.store.saveBatch({ ...batch, status: 'closed' })
    return { id: batchId, status: 'closed' }
  }

  async reopenBatch(batchId: string): Promise<{ id: string; status: 'open' }> {
    this.requireAuth()
    const batch = this.store.getBatch(batchId)
    if (!batch) throw new ApiError(404, 'NOT_FOUND', '批次不存在')
    if (batch.status !== 'closed') throw new ApiError(409, 'BATCH_NOT_CLOSED', '只有关闭批次可以重新开放')
    this.store.saveBatch({ ...batch, status: 'open' })
    return { id: batchId, status: 'open' }
  }

  async extendBatch(batchId: string, deadlineAt: string): Promise<AdminBatch> {
    this.requireAuth()
    const batch = this.store.getBatch(batchId)
    if (!batch) throw new ApiError(404, 'NOT_FOUND', '批次不存在')
    if (batch.status !== 'open') throw new ApiError(409, 'BATCH_NOT_OPEN', '只有开放批次可以延长截止时间')
    if (deadlineAt <= batch.deadlineAt) throw new ApiError(400, 'BAD_REQUEST', '新的截止时间必须晚于当前截止时间')
    const updated = { ...batch, deadlineAt }
    this.store.saveBatch(updated)
    return { ...updated }
  }

  async archiveBatch(batchId: string): Promise<AdminBatch> {
    this.requireAuth()
    const batch = this.store.getBatch(batchId)
    if (!batch) throw new ApiError(404, 'NOT_FOUND', '批次不存在')
    if (batch.status !== 'closed') throw new ApiError(409, 'BATCH_NOT_CLOSED', '只有已关闭批次可以归档')
    const updated = { ...batch, status: 'archived' as const }
    this.store.saveBatch(updated)
    return { ...updated }
  }

  async copyBatch(sourceBatchId: string, input: { name: string; assessmentDate: string; startsAt: string; deadlineAt: string }): Promise<{ batch: AdminBatch; copiedParticipants: number; copiedAssignments: number }> {
    this.requireAuth()
    const source = this.store.getBatch(sourceBatchId)
    if (!source) throw new ApiError(404, 'NOT_FOUND', '源批次不存在')
    const batch: AdminBatch = {
      id: this.store.nextId('batch'),
      name: input.name.trim(),
      roleId: source.roleId,
      questionnaireVersionId: source.questionnaireVersionId,
      assessmentDate: input.assessmentDate,
      startsAt: input.startsAt,
      deadlineAt: input.deadlineAt,
      status: 'draft',
    }
    this.store.saveBatch(batch)
    const participantIdMap = new Map<string, string>()
    let copiedParticipants = 0
    for (const participant of this.store.listParticipants(sourceBatchId).filter((candidate) => candidate.status === 'active')) {
      const newId = this.store.nextId('participant')
      participantIdMap.set(participant.id, newId)
      this.store.saveParticipant({
        id: newId,
        batchId: batch.id,
        personId: participant.personId,
        nameSnapshot: participant.nameSnapshot,
        departmentSnapshot: participant.departmentSnapshot,
        roleIdSnapshot: source.roleId,
        status: 'active',
      })
      copiedParticipants += 1
    }
    let copiedAssignments = 0
    for (const assignment of this.store.listAssignments(sourceBatchId).filter((candidate) => candidate.status !== 'cancelled')) {
      const newParticipantId = participantIdMap.get(assignment.participantId)
      if (!newParticipantId) continue
      this.store.saveAssignment({
        id: this.store.nextId('assignment'),
        batchId: batch.id,
        participantId: newParticipantId,
        raterPersonId: assignment.raterPersonId,
        raterNameSnapshot: assignment.raterNameSnapshot,
        raterDepartmentSnapshot: assignment.raterDepartmentSnapshot,
        normalizedRaterName: assignment.normalizedRaterName,
        normalizedRaterDepartment: assignment.normalizedRaterDepartment,
        level: assignment.level,
        status: 'pending',
        currentSubmissionId: null,
        submittedAt: null,
      })
      copiedAssignments += 1
    }
    return { batch, copiedParticipants, copiedAssignments }
  }

  async importPeople(rows: AdminPersonImportRow[]): Promise<AdminImportResult> {
    this.requireAuth()
    let imported = 0
    const errors: AdminImportResult['errors'] = []
    for (let index = 0; index < rows.length; index += 1) {
      try {
        await this.createPerson(rows[index])
        imported += 1
      } catch (error) {
        errors.push({ row: index + 1, message: error instanceof Error ? error.message : '导入失败' })
      }
    }
    return { imported, errors }
  }

  async exportBatch(batchId: string): Promise<AdminExportFile> {
    this.requireAuth()
    const batch = this.store.getBatch(batchId)
    if (!batch) throw new ApiError(404, 'NOT_FOUND', '批次不存在')
    const rows = this.store.listParticipants(batchId)
      .filter((participant) => participant.batchId === batchId)
      .map((participant) => {
        const assignment = this.store.listAssignments(batchId).find((candidate) => candidate.participantId === participant.id)
        return [batch.name, participant.nameSnapshot, participant.departmentSnapshot, assignment?.raterNameSnapshot ?? '', assignment?.level ?? '', assignment?.status ?? '未分配']
      })
    const csv = ['批次,被评估人,部门,评分人,层级,状态', ...rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))].join('\r\n')
    return { filename: `${batch.name}.csv`, contentType: 'text/csv', data: toBase64(csv) }
  }

  async getQuestionBank(): Promise<QuestionBank> {
    this.requireAuth()
    return this.bank
  }

  async saveQuestionBankRole(roleId: string, role: QuestionBankRole): Promise<{ updated: boolean }> {
    this.requireAuth()
    this.bank = {
      ...this.bank,
      roles: this.bank.roles.map((item) => item.id === roleId ? role : item),
    }
    return { updated: true }
  }

  private requireAuth(): void {
    if (!this.loggedIn) throw new ApiError(401, 'ADMIN_UNAUTHORIZED', '管理会话已失效，请重新登录')
  }
}

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
