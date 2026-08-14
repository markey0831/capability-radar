import { randomUUID } from 'node:crypto'
import { QUESTION_BANK } from '../../../../shared/question-bank/load'
import { normalizeRaterIdentity } from '../../../../shared/identity/normalize-identity'
import type { RaterLevel } from '../../../../shared/domain/types'
import type { ManagementRepository } from '../repositories/contracts'
import { ApiError, badRequest, notFound } from '../http/errors'

export interface ManagementServiceDependencies {
  repository: ManagementRepository
  now: () => Date
  createId?: () => string
}

function requireText(value: string, label: string, maximum: number): string {
  const trimmed = value.trim()
  if (!trimmed) throw badRequest(`请填写${label}`)
  if (trimmed.length > maximum) throw badRequest(`${label}内容过长`)
  return trimmed
}

export class ManagementService {
  constructor(private readonly dependencies: ManagementServiceDependencies) {}

  async listPeople() {
    return this.dependencies.repository.listPeople()
  }

  async listBatches() {
    return this.dependencies.repository.listBatches()
  }

  async getBatchDetails(batchId: string) {
    const batch = await this.dependencies.repository.getBatch(batchId)
    if (!batch) throw notFound('批次不存在')
    return {
      batch,
      participants: await this.dependencies.repository.listParticipants(batchId),
      assignments: await this.dependencies.repository.listAssignments(batchId),
    }
  }

  async createPerson(input: {
    name: string
    department: string
    currentRoleId?: string | null
    canBeEvaluatee: boolean
    canBeRater: boolean
  }) {
    const identity = normalizeRaterIdentity(requireText(input.name, '姓名', 100), requireText(input.department, '部门', 200))
    if (input.currentRoleId && !QUESTION_BANK.roles.some((role) => role.id === input.currentRoleId)) throw badRequest('职位不存在')
    const person = {
      id: this.dependencies.createId?.() ?? randomUUID(),
      name: identity.displayName,
      normalizedName: identity.normalizedName,
      department: identity.displayDepartment,
      normalizedDepartment: identity.normalizedDepartment,
      currentRoleId: input.currentRoleId ?? null,
      canBeEvaluatee: Boolean(input.canBeEvaluatee),
      canBeRater: Boolean(input.canBeRater),
      status: 'active' as const,
    }
    await this.dependencies.repository.savePerson(person)
    return person
  }

  async updatePerson(personId: string, input: {
    name: string
    department: string
    currentRoleId?: string | null
    status?: 'active' | 'inactive'
    canBeEvaluatee?: boolean
    canBeRater?: boolean
  }) {
    const existing = await this.dependencies.repository.getPerson(personId)
    if (!existing) throw notFound('人员不存在')
    if (input.currentRoleId && !QUESTION_BANK.roles.some((role) => role.id === input.currentRoleId)) throw badRequest('职位不存在')
    if (input.status && !['active', 'inactive'].includes(input.status)) throw badRequest('人员状态不正确')
    const identity = normalizeRaterIdentity(requireText(input.name, '姓名', 100), requireText(input.department, '部门', 200))
    const updated = {
      ...existing,
      name: identity.displayName,
      normalizedName: identity.normalizedName,
      department: identity.displayDepartment,
      normalizedDepartment: identity.normalizedDepartment,
      currentRoleId: input.currentRoleId ?? null,
      status: input.status ?? existing.status,
      canBeEvaluatee: input.canBeEvaluatee ?? existing.canBeEvaluatee,
      canBeRater: input.canBeRater ?? existing.canBeRater,
    }
    await this.dependencies.repository.savePerson(updated)
    return updated
  }

  async createBatch(input: { name: string; roleId: string; assessmentDate: string; startsAt: string; deadlineAt: string }) {
    if (!QUESTION_BANK.roles.some((role) => role.id === input.roleId)) throw badRequest('职位不存在')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.assessmentDate)) throw badRequest('评估日期格式不正确')
    if (!Number.isFinite(Date.parse(input.startsAt)) || !Number.isFinite(Date.parse(input.deadlineAt))) throw badRequest('开放或截止时间格式不正确')
    if (input.startsAt >= input.deadlineAt) throw badRequest('截止时间必须晚于开放时间')
    const batch = {
      id: this.dependencies.createId?.() ?? randomUUID(),
      name: requireText(input.name, '批次名称', 200),
      roleId: input.roleId,
      questionnaireVersionId: QUESTION_BANK.version,
      assessmentDate: input.assessmentDate,
      startsAt: input.startsAt,
      deadlineAt: input.deadlineAt,
      status: 'draft' as const,
    }
    await this.dependencies.repository.saveBatch(batch)
    return batch
  }

  async addParticipant(batchId: string, personId: string) {
    const batch = await this.dependencies.repository.getBatch(batchId)
    const person = await this.dependencies.repository.getPerson(personId)
    if (!batch || batch.status !== 'draft') throw new ApiError(409, 'BATCH_NOT_EDITABLE', '批次当前不能修改')
    if (!person || person.status !== 'active' || !person.canBeEvaluatee) throw badRequest('被评估人不存在或未启用')
    if (person.currentRoleId !== batch.roleId) throw badRequest('被评估人的职位与批次不一致')
    const existing = (await this.dependencies.repository.listParticipants(batchId)).find((candidate) => candidate.personId === personId)
    if (existing) {
      if (existing.status === 'active') return existing
      const restored = {
        ...existing,
        nameSnapshot: person.name,
        departmentSnapshot: person.department,
        roleIdSnapshot: batch.roleId,
        status: 'active' as const,
      }
      await this.dependencies.repository.saveParticipant(restored)
      return restored
    }
    const participant = {
      id: this.dependencies.createId?.() ?? randomUUID(), batchId, personId,
      nameSnapshot: person.name, departmentSnapshot: person.department, roleIdSnapshot: batch.roleId, status: 'active' as const,
    }
    await this.dependencies.repository.saveParticipant(participant)
    return participant
  }

  async addAssignment(batchId: string, participantId: string, raterPersonId: string, level: RaterLevel) {
    const batch = await this.dependencies.repository.getBatch(batchId)
    const participant = (await this.dependencies.repository.listParticipants(batchId)).find((candidate) => candidate.id === participantId)
    const rater = await this.dependencies.repository.getPerson(raterPersonId)
    if (!batch || batch.status !== 'draft') throw new ApiError(409, 'BATCH_NOT_EDITABLE', '批次当前不能修改')
    if (!participant || participant.status !== 'active') throw badRequest('被评估人不在该批次')
    if (!rater || rater.status !== 'active' || !rater.canBeRater) throw badRequest('评分人不存在或未启用')
    if (!['superior', 'peer', 'subordinate'].includes(level)) throw badRequest('评分层级不正确')
    const identity = normalizeRaterIdentity(rater.name, rater.department)
    const existing = (await this.dependencies.repository.listAssignments(batchId)).find((candidate) =>
      candidate.participantId === participantId && candidate.raterPersonId === raterPersonId,
    )
    if (existing) {
      if (existing.status !== 'cancelled') throw new ApiError(409, 'DUPLICATE_ASSIGNMENT', '该评分任务已经存在')
      const restored = {
        ...existing,
        raterNameSnapshot: rater.name,
        raterDepartmentSnapshot: rater.department,
        normalizedRaterName: identity.normalizedName,
        normalizedRaterDepartment: identity.normalizedDepartment,
        level,
        status: 'pending' as const,
        currentSubmissionId: null,
        submittedAt: null,
      }
      await this.dependencies.repository.saveAssignment(restored)
      return restored
    }
    const assignment = {
      id: this.dependencies.createId?.() ?? randomUUID(), batchId, participantId, raterPersonId,
      raterNameSnapshot: rater.name, raterDepartmentSnapshot: rater.department,
      normalizedRaterName: identity.normalizedName, normalizedRaterDepartment: identity.normalizedDepartment,
      level, status: 'pending' as const, currentSubmissionId: null, submittedAt: null,
    }
    try {
      await this.dependencies.repository.saveAssignment(assignment)
    } catch (error) {
      if (error instanceof Error && error.message === 'DUPLICATE_ASSIGNMENT') throw new ApiError(409, 'DUPLICATE_ASSIGNMENT', '该评分任务已经存在')
      throw error
    }
    return assignment
  }

  async removeParticipant(batchId: string, participantId: string) {
    const batch = await this.dependencies.repository.getBatch(batchId)
    if (!batch || batch.status !== 'draft') throw new ApiError(409, 'BATCH_NOT_EDITABLE', '只有草稿批次可以修改被评人名单')
    const participant = (await this.dependencies.repository.listParticipants(batchId)).find((item) => item.id === participantId)
    if (!participant) throw notFound('被评人不在该批次')
    const assignments = await this.dependencies.repository.listAssignments(batchId)
    for (const assignment of assignments.filter((item) => item.participantId === participantId && item.status !== 'cancelled')) {
      await this.dependencies.repository.saveAssignment({ ...assignment, status: 'cancelled' })
    }
    const removed = { ...participant, status: 'removed' as const }
    await this.dependencies.repository.saveParticipant(removed)
    return removed
  }

  async cancelAssignment(batchId: string, assignmentId: string) {
    const batch = await this.dependencies.repository.getBatch(batchId)
    if (!batch || batch.status !== 'draft') throw new ApiError(409, 'BATCH_NOT_EDITABLE', '只有草稿批次可以修改评分任务')
    const assignment = (await this.dependencies.repository.listAssignments(batchId)).find((item) => item.id === assignmentId)
    if (!assignment) throw notFound('评分任务不存在')
    const cancelled = { ...assignment, status: 'cancelled' as const }
    await this.dependencies.repository.saveAssignment(cancelled)
    return cancelled
  }

  async openBatch(batchId: string) {
    const batch = await this.dependencies.repository.getBatch(batchId)
    if (!batch) throw notFound('批次不存在')
    const participants = (await this.dependencies.repository.listParticipants(batchId)).filter((item) => item.status === 'active')
    const assignments = (await this.dependencies.repository.listAssignments(batchId)).filter((item) => item.status !== 'cancelled')
    if (participants.length === 0 || assignments.length === 0) throw badRequest('开放前必须配置被评估人和评分任务')
    for (const participant of participants) {
      if (!assignments.some((assignment) => assignment.participantId === participant.id)) throw badRequest(`${participant.nameSnapshot}尚未分配评分人`)
    }
    const identityOwners = new Map<string, string>()
    for (const assignment of assignments) {
      const key = `${assignment.normalizedRaterName}\u0000${assignment.normalizedRaterDepartment}`
      const owner = identityOwners.get(key)
      if (owner && owner !== assignment.raterPersonId) {
        throw new ApiError(409, 'AMBIGUOUS_RATER_IDENTITY', `评分人“${assignment.raterNameSnapshot} / ${assignment.raterDepartmentSnapshot}”无法唯一识别，请细化部门名称`)
      }
      identityOwners.set(key, assignment.raterPersonId)
    }
    const opened = await this.dependencies.repository.openBatchAtomic(batchId, batch.roleId, this.dependencies.now().toISOString())
    if (opened === 'role-already-open') throw new ApiError(409, 'ROLE_BATCH_ALREADY_OPEN', '该职位已经有一个开放批次')
    if (opened !== 'opened') throw new ApiError(409, 'BATCH_NOT_EDITABLE', '批次当前不能开放')
    return { id: batchId, status: 'open' as const }
  }
}
