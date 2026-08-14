import { QUESTION_BANK } from '../../../../shared/question-bank/load'
import { normalizeRaterIdentity } from '../../../../shared/identity/normalize-identity'
import type { PublicAssessmentRepository } from '../repositories/contracts'
import { ApiError, badRequest, notFound } from '../http/errors'
import { issueTaskToken, verifyTaskToken } from '../security/task-token'

export interface PublicServiceDependencies {
  repository: PublicAssessmentRepository
  taskTokenSecret: string
  now: () => Date
  tokenTtlMs: number
}

function findRole(roleId: string) {
  return QUESTION_BANK.roles.find((role) => role.id === roleId)
}

export class PublicQuestionnaireService {
  constructor(private readonly dependencies: PublicServiceDependencies) {}

  async getQuestionnaire(roleId: string) {
    const role = findRole(roleId)
    if (!role) throw notFound('未找到对应职位')
    const batch = await this.dependencies.repository.findOpenBatchByRole(roleId, this.dependencies.now().toISOString())
    return {
      role: { id: role.id, name: role.name },
      batch: batch
        ? { id: batch.id, name: batch.name, assessmentDate: batch.assessmentDate, deadlineAt: batch.deadlineAt }
        : null,
      questionnaireVersion: QUESTION_BANK.version,
      anonymityNotice: '您的姓名仅供管理员核对完成情况，不会向被评估人展示，也不会出现在能力图或最终报告中。',
    }
  }

  async lookupTasks(roleId: string, name: string, department: string) {
    if (name.length > 100 || department.length > 200) throw badRequest('姓名或部门内容过长')
    const identity = normalizeRaterIdentity(name, department)
    if (!identity.normalizedName || !identity.normalizedDepartment) throw badRequest('请填写姓名和所在部门')
    const role = findRole(roleId)
    if (!role) throw new ApiError(404, 'NO_ASSIGNMENTS', '未找到待评价任务')
    const now = this.dependencies.now()
    const batch = await this.dependencies.repository.findOpenBatchByRole(roleId, now.toISOString())
    if (!batch) throw new ApiError(404, 'NO_ASSIGNMENTS', '未找到待评价任务')
    const assignments = await this.dependencies.repository.findAssignmentsByIdentity(
      batch.id,
      identity.normalizedName,
      identity.normalizedDepartment,
    )
    if (assignments.length === 0) throw new ApiError(404, 'NO_ASSIGNMENTS', '未找到待评价任务')

    const tasks = await Promise.all(assignments.map(async (assignment) => {
      const participant = await this.dependencies.repository.getParticipant(assignment.participantId)
      if (!participant || participant.status !== 'active') return null
      const token = assignment.status === 'pending'
        ? issueTaskToken({
            assignmentId: assignment.id,
            batchId: batch.id,
            questionnaireVersionId: batch.questionnaireVersionId,
            expiresAt: Math.min(now.getTime() + this.dependencies.tokenTtlMs, new Date(batch.deadlineAt).getTime()),
          }, this.dependencies.taskTokenSecret)
        : null
      return {
        taskId: assignment.id,
        token,
        status: assignment.status,
        submittedAt: assignment.submittedAt,
        level: assignment.level,
        evaluatee: { name: participant.nameSnapshot, department: participant.departmentSnapshot },
      }
    }))
    const visibleTasks = tasks.filter((task) => task !== null)
    if (visibleTasks.length === 0) throw new ApiError(404, 'NO_ASSIGNMENTS', '未找到待评价任务')
    return { batch: { id: batch.id, name: batch.name, deadlineAt: batch.deadlineAt }, role: { id: role.id, name: role.name }, tasks: visibleTasks }
  }

  async getTaskForm(token: string) {
    const now = this.dependencies.now()
    const payload = verifyTaskToken(token, this.dependencies.taskTokenSecret, now.getTime())
    const assignment = await this.dependencies.repository.getAssignment(payload.assignmentId)
    if (!assignment || assignment.batchId !== payload.batchId || assignment.status !== 'pending') {
      throw new ApiError(409, 'TASK_NOT_AVAILABLE', '该评价任务当前不可填写')
    }
    const participant = await this.dependencies.repository.getParticipant(assignment.participantId)
    const batch = await this.dependencies.repository.findOpenBatchByRole(
      participant?.roleIdSnapshot ?? '',
      now.toISOString(),
    )
    if (!participant || !batch || batch.id !== assignment.batchId || batch.questionnaireVersionId !== payload.questionnaireVersionId) {
      throw new ApiError(409, 'TASK_NOT_AVAILABLE', '该评价任务当前不可填写')
    }
    const role = findRole(batch.roleId)
    if (!role) throw new ApiError(409, 'TASK_NOT_AVAILABLE', '该评价任务当前不可填写')
    return {
      task: {
        id: assignment.id,
        level: assignment.level,
        evaluatee: { name: participant.nameSnapshot, department: participant.departmentSnapshot },
      },
      batch: { id: batch.id, name: batch.name, deadlineAt: batch.deadlineAt },
      role,
      questionnaireVersion: QUESTION_BANK.version,
    }
  }
}
