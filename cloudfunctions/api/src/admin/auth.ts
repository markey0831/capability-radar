import type { Router } from '../http/router'
import { ApiError, badRequest } from '../http/errors'
import type { AdminSessionService } from '../security/session'
import type { RateLimiter } from '../security/rate-limit'
import { enforceRateLimit } from '../security/rate-limit'
import { verifyAdminPassword } from '../security/password'

export interface AdminAuthDependencies {
  sessions: AdminSessionService
  rateLimiter: RateLimiter
  now: () => Date
  passwordSalt: string
  passwordHash: string
  allowedOrigins: ReadonlySet<string>
}

function assertWriteOrigin(origin: string | undefined, allowedOrigins: ReadonlySet<string>): void {
  if (!origin || !allowedOrigins.has(origin)) throw new ApiError(403, 'ORIGIN_REJECTED', '安全校验失败，请从管理页面重试')
}

export function registerAdminAuthRoutes(router: Router, dependencies: AdminAuthDependencies): void {
  router.register('POST', '/admin/login', async (request) => {
    assertWriteOrigin(request.headers.origin, dependencies.allowedOrigins)
    await enforceRateLimit(dependencies.rateLimiter, `admin-login:${request.headers['x-forwarded-for'] ?? 'unknown'}`, dependencies.now().getTime())
    const body = request.json as { password?: unknown } | null
    if (!body || typeof body.password !== 'string' || body.password.length === 0 || body.password.length > 500) throw badRequest('请输入管理密码')
    const valid = await verifyAdminPassword(body.password, dependencies.passwordSalt, dependencies.passwordHash)
    if (!valid) throw new ApiError(401, 'ADMIN_LOGIN_FAILED', '管理密码不正确')
    const issued = await dependencies.sessions.issue()
    return {
      status: 200,
      headers: { 'Set-Cookie': issued.cookie },
      body: { authenticated: true, csrfToken: issued.csrfToken, expiresAt: issued.expiresAt },
    }
  })

  router.register('GET', '/admin/session', async (request) => {
    const refreshed = await dependencies.sessions.refreshCsrf(request.headers.cookie)
    return { status: 200, body: { authenticated: true, expiresAt: refreshed.session.expiresAt, csrfToken: refreshed.csrfToken } }
  })

  router.register('POST', '/admin/logout', async (request) => {
    assertWriteOrigin(request.headers.origin, dependencies.allowedOrigins)
    await dependencies.sessions.authenticateWrite(request.headers.cookie, request.headers['x-csrf-token'])
    await dependencies.sessions.revoke(request.headers.cookie)
    return { status: 200, headers: { 'Set-Cookie': dependencies.sessions.clearCookie() }, body: { authenticated: false } }
  })
}

export { assertWriteOrigin }
