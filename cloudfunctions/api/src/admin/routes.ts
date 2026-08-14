import { QUESTION_BANK } from '../../../../shared/question-bank/load'
import type { RaterLevel } from '../../../../shared/domain/types'
import type { Router } from '../http/router'
import type { HttpRequest } from '../http/types'
import { badRequest } from '../http/errors'
import type { AdminSessionService } from '../security/session'
import type { ManagementService } from '../services/management-service'
import type { ResultService } from '../services/result-service'
import type { AuditService } from '../audit/audit-service'
import { assertWriteOrigin } from './auth'

interface AdminRouteDependencies {
  sessions: AdminSessionService
  management: ManagementService
  results: ResultService
  audit: AuditService
  allowedOrigins: ReadonlySet<string>
}

function body(request: HttpRequest): Record<string, unknown> {
  if (!request.json || typeof request.json !== 'object' || Array.isArray(request.json)) throw badRequest()
  return request.json as Record<string, unknown>
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string') throw badRequest(`请填写${label}`)
  return value
}

function optionalText(value: unknown, label: string): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  return text(value, label)
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw badRequest(`${label}格式不正确`)
  return value
}

async function readSession(request: HttpRequest, dependencies: AdminRouteDependencies) {
  return dependencies.sessions.authenticate(request.headers.cookie)
}

async function writeSession(request: HttpRequest, dependencies: AdminRouteDependencies) {
  assertWriteOrigin(request.headers.origin, dependencies.allowedOrigins)
  return dependencies.sessions.authenticateWrite(request.headers.cookie, request.headers['x-csrf-token'])
}

async function audited<T>(
  request: HttpRequest,
  dependencies: AdminRouteDependencies,
  input: { action: string; targetType: string; targetId: string },
  action: () => Promise<T>,
): Promise<T> {
  const session = await writeSession(request, dependencies)
  return dependencies.audit.run({
    ...input,
    actorSessionId: session.id,
    requestId: request.requestId,
  }, action)
}

export function registerAdminRoutes(router: Router, dependencies: AdminRouteDependencies): void {
  router.register('GET', '/admin/roles', async (request) => {
    await readSession(request, dependencies)
    return {
      status: 200,
      body: QUESTION_BANK.roles.map((role) => ({
        id: role.id,
        code: role.id,
        name: role.name,
        dimensions: role.dimensions.map((dimension) => ({ id: dimension.id, name: dimension.name })),
      })),
    }
  })

  router.register('GET', '/admin/people', async (request) => {
    await readSession(request, dependencies)
    return { status: 200, body: await dependencies.management.listPeople() }
  })

  router.register('POST', '/admin/people', async (request) => {
    const input = body(request)
    const person = await audited(request, dependencies, { action: 'person.create', targetType: 'person', targetId: 'new' }, () =>
      dependencies.management.createPerson({
        name: text(input.name, '姓名'),
        department: text(input.department, '部门'),
        currentRoleId: optionalText(input.currentRoleId, '职位'),
        canBeEvaluatee: boolean(input.canBeEvaluatee, '被评人权限'),
        canBeRater: boolean(input.canBeRater, '评分人权限'),
      }),
    )
    return { status: 201, body: person }
  })

  router.register('PUT', '/admin/people/:personId', async (request, params) => {
    const input = body(request)
    const person = await audited(request, dependencies, { action: 'person.update', targetType: 'person', targetId: params.personId }, () =>
      dependencies.management.updatePerson(params.personId, {
        name: text(input.name, '姓名'),
        department: text(input.department, '部门'),
        currentRoleId: optionalText(input.currentRoleId, '职位'),
        status: input.status === undefined ? undefined : text(input.status, '状态') as 'active' | 'inactive',
        canBeEvaluatee: input.canBeEvaluatee === undefined ? undefined : boolean(input.canBeEvaluatee, '被评人权限'),
        canBeRater: input.canBeRater === undefined ? undefined : boolean(input.canBeRater, '评分人权限'),
      }),
    )
    return { status: 200, body: person }
  })

  router.register('GET', '/admin/batches', async (request) => {
    await readSession(request, dependencies)
    return { status: 200, body: await dependencies.management.listBatches() }
  })

  router.register('POST', '/admin/batches', async (request) => {
    const input = body(request)
    const batch = await audited(request, dependencies, { action: 'batch.create', targetType: 'batch', targetId: 'new' }, () =>
      dependencies.management.createBatch({
        name: text(input.name, '批次名称'),
        roleId: text(input.roleId, '职位'),
        assessmentDate: text(input.assessmentDate, '评估日期'),
        startsAt: text(input.startsAt, '开放时间'),
        deadlineAt: text(input.deadlineAt, '截止时间'),
      }),
    )
    return { status: 201, body: batch }
  })

  router.register('GET', '/admin/batches/:batchId', async (request, params) => {
    await readSession(request, dependencies)
    return { status: 200, body: await dependencies.management.getBatchDetails(params.batchId) }
  })

  router.register('POST', '/admin/batches/:batchId/participants', async (request, params) => {
    const input = body(request)
    const participant = await audited(
      request,
      dependencies,
      { action: 'participant.add', targetType: 'batch', targetId: params.batchId },
      () => dependencies.management.addParticipant(params.batchId, text(input.personId, '被评人')),
    )
    return { status: 201, body: participant }
  })

  router.register('DELETE', '/admin/batches/:batchId/participants/:participantId', async (request, params) => {
    const participant = await audited(
      request,
      dependencies,
      { action: 'participant.remove', targetType: 'participant', targetId: params.participantId },
      () => dependencies.management.removeParticipant(params.batchId, params.participantId),
    )
    return { status: 200, body: participant }
  })

  router.register('POST', '/admin/batches/:batchId/assignments', async (request, params) => {
    const input = body(request)
    const assignment = await audited(
      request,
      dependencies,
      { action: 'assignment.add', targetType: 'batch', targetId: params.batchId },
      () => dependencies.management.addAssignment(
        params.batchId,
        text(input.participantId, '被评人'),
        text(input.raterPersonId, '评分人'),
        text(input.level, '评分层级') as RaterLevel,
      ),
    )
    return { status: 201, body: assignment }
  })

  router.register('DELETE', '/admin/batches/:batchId/assignments/:assignmentId', async (request, params) => {
    const assignment = await audited(
      request,
      dependencies,
      { action: 'assignment.cancel', targetType: 'assignment', targetId: params.assignmentId },
      () => dependencies.management.cancelAssignment(params.batchId, params.assignmentId),
    )
    return { status: 200, body: assignment }
  })

  router.register('POST', '/admin/batches/:batchId/open', async (request, params) => {
    const result = await audited(request, dependencies, { action: 'batch.open', targetType: 'batch', targetId: params.batchId }, () =>
      dependencies.management.openBatch(params.batchId),
    )
    return { status: 200, body: result }
  })

  router.register('POST', '/admin/batches/:batchId/close', async (request, params) => {
    const result = await audited(request, dependencies, { action: 'batch.close', targetType: 'batch', targetId: params.batchId }, () =>
      dependencies.results.closeBatch(params.batchId),
    )
    return { status: 200, body: result }
  })

  router.register('POST', '/admin/batches/:batchId/reopen', async (request, params) => {
    const result = await audited(request, dependencies, { action: 'batch.reopen', targetType: 'batch', targetId: params.batchId }, () =>
      dependencies.results.reopenBatch(params.batchId),
    )
    return { status: 200, body: result }
  })

  router.register('GET', '/admin/batches/:batchId/submissions', async (request, params) => {
    await readSession(request, dependencies)
    const details = await dependencies.management.getBatchDetails(params.batchId)
    const submissions = await dependencies.results.listSubmissions(params.batchId)
    return { status: 200, body: { ...details, submissions } }
  })

  router.register('POST', '/admin/submissions/:submissionId/void', async (request, params) => {
    const input = body(request)
    const result = await audited(
      request,
      dependencies,
      { action: 'submission.void', targetType: 'submission', targetId: params.submissionId },
      () => dependencies.results.voidSubmission(params.submissionId, text(input.reason, '作废原因')),
    )
    return { status: 200, body: result }
  })

  router.register('GET', '/admin/batches/:batchId/results/:participantId', async (request, params) => {
    await readSession(request, dependencies)
    return { status: 200, body: await dependencies.results.getParticipantResult(params.batchId, params.participantId) }
  })
}
