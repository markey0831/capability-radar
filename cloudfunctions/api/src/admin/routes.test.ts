import { describe, expect, it } from 'vitest'
import { createApp } from '../app'
import type { CloudBaseHttpEvent } from '../http/types'
import { MemoryAdminSessionRepository } from '../repositories/memory/admin-session-repository'
import { MemoryManagementRepository } from '../repositories/memory/management-repository'
import { AdminSessionService } from '../security/session'
import { ManagementService } from '../services/management-service'
import { ResultService } from '../services/result-service'
import { AuditService } from '../audit/audit-service'
import { registerAdminRoutes } from './routes'

const origin = 'https://app.example.com'
const config = {
  appEnv: 'test' as const,
  allowedOrigins: new Set([origin]),
  maxJsonBodyBytes: 1_048_576,
}

function event(method: CloudBaseHttpEvent['httpMethod'], path: string, options: {
  cookie?: string
  csrf?: string
  origin?: string
  body?: unknown
} = {}): CloudBaseHttpEvent {
  return {
    httpMethod: method,
    path,
    headers: {
      origin: options.origin,
      cookie: options.cookie,
      'x-csrf-token': options.csrf,
      'content-type': 'application/json',
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    requestContext: { requestId: 'request-1' },
  }
}

async function setup() {
  const repository = new MemoryManagementRepository()
  const sessionRepository = new MemoryAdminSessionRepository()
  const tokens = ['session-secret', 'csrf-secret']
  const now = () => new Date('2026-08-13T08:00:00.000Z')
  const sessions = new AdminSessionService({ repository: sessionRepository, now, randomToken: () => tokens.shift()! })
  const issued = await sessions.issue()
  const management = new ManagementService({ repository, now, createId: (() => {
    let id = 0
    return () => `id-${++id}`
  })() })
  const app = createApp(config, (router) => registerAdminRoutes(router, {
    sessions,
    management,
    results: new ResultService(repository, now),
    audit: new AuditService(repository, now, () => `audit-${repository.auditLogs.size + 1}`),
    allowedOrigins: config.allowedOrigins,
  }))
  return {
    app,
    repository,
    cookie: issued.cookie.split(';')[0],
    csrf: issued.csrfToken,
  }
}

describe('admin routes', () => {
  it('拒绝没有会话的管理读取', async () => {
    const { app } = await setup()
    const response = await app.handle(event('GET', '/admin/people'))
    expect(response.statusCode).toBe(401)
    expect(JSON.parse(response.body).error.code).toBe('ADMIN_UNAUTHORIZED')
  })

  it('管理写操作必须同时具有允许的 Origin 和正确 CSRF', async () => {
    const { app, cookie } = await setup()
    const payload = { name: '张三', department: '销售部', currentRoleId: 'sales', canBeEvaluatee: true, canBeRater: true }

    const missingCsrf = await app.handle(event('POST', '/admin/people', { cookie, origin, body: payload }))
    expect(missingCsrf.statusCode).toBe(403)
    expect(JSON.parse(missingCsrf.body).error.code).toBe('CSRF_REJECTED')

    const wrongOrigin = await app.handle(event('POST', '/admin/people', { cookie, csrf: 'csrf-secret', origin: 'https://evil.example', body: payload }))
    expect(wrongOrigin.statusCode).toBe(403)
    expect(JSON.parse(wrongOrigin.body).error.code).toBe('ORIGIN_REJECTED')
  })

  it('成功创建人员并留下最小审计记录', async () => {
    const { app, repository, cookie, csrf } = await setup()
    const response = await app.handle(event('POST', '/admin/people', {
      cookie,
      csrf,
      origin,
      body: { name: ' 张三 ', department: '销售部', currentRoleId: 'sales', canBeEvaluatee: true, canBeRater: true },
    }))

    expect(response.statusCode).toBe(201)
    expect(JSON.parse(response.body)).toMatchObject({ name: '张三', department: '销售部', currentRoleId: 'sales' })
    expect(repository.people).toHaveLength(1)
    expect([...repository.auditLogs.values()][0]).toMatchObject({
      action: 'person.create',
      targetType: 'person',
      targetId: 'new',
      outcome: 'success',
      requestId: 'request-1',
    })
    expect(JSON.stringify([...repository.auditLogs.values()])).not.toContain('csrf-secret')
    expect(JSON.stringify([...repository.auditLogs.values()])).not.toContain('张三')
  })

  it('被评人名单只允许在草稿批次维护', async () => {
    const { app, repository, cookie, csrf } = await setup()
    repository.people.set('person-1', {
      id: 'person-1', name: '张三', normalizedName: '张三', department: '销售部', normalizedDepartment: '销售部',
      currentRoleId: 'sales', canBeEvaluatee: true, canBeRater: true, status: 'active',
    })
    repository.batches.set('batch-1', {
      id: 'batch-1', name: '批次', roleId: 'sales', questionnaireVersionId: 'v1', assessmentDate: '2026-08-13',
      startsAt: '2026-08-01T00:00:00.000Z', deadlineAt: '2026-08-31T00:00:00.000Z', status: 'open',
    })

    const response = await app.handle(event('POST', '/admin/batches/batch-1/participants', {
      cookie, csrf, origin, body: { personId: 'person-1' },
    }))
    expect(response.statusCode).toBe(409)
    expect(JSON.parse(response.body).error.code).toBe('BATCH_NOT_EDITABLE')
    expect([...repository.auditLogs.values()][0]).toMatchObject({ outcome: 'failure', errorCode: 'BATCH_NOT_EDITABLE' })
  })
})
