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
  getPassword: () => Promise<{ saltHex: string; hashHex: string }>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
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
    const current = await dependencies.getPassword()
    const valid = await verifyAdminPassword(body.password, current.saltHex, current.hashHex)
    if (!valid) throw new ApiError(401, 'ADMIN_LOGIN_FAILED', '管理密码不正确')
    const issued = await dependencies.sessions.issue()
    return {
      status: 200,
      headers: { 'Set-Cookie': issued.cookie },
      body: { authenticated: true, csrfToken: issued.csrfToken, expiresAt: issued.expiresAt },
    }
  })

  router.register('POST', '/admin/change-password', async (request) => {
    assertWriteOrigin(request.headers.origin, dependencies.allowedOrigins)
    await dependencies.sessions.authenticateWrite(request.headers.cookie, request.headers['x-csrf-token'])
    await enforceRateLimit(dependencies.rateLimiter, `change-password:${request.headers['x-forwarded-for'] ?? 'unknown'}`, dependencies.now().getTime())
    const body = request.json as { currentPassword?: unknown; newPassword?: unknown } | null
    const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : ''
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : ''
    if (!currentPassword) throw badRequest('请输入当前密码')
    if (newPassword.length < 12) throw badRequest('新密码至少需要12个字符')
    if (newPassword.length > 500) throw badRequest('新密码过长')
    await dependencies.changePassword(currentPassword, newPassword)
    return { status: 200, body: { changed: true } }
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
