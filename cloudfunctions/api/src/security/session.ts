import { createHash, randomBytes } from 'node:crypto'
import type { AdminSessionRecord, AdminSessionRepository } from '../repositories/contracts'
import { ApiError } from '../http/errors'

const SESSION_COOKIE = 'capability_admin_session'

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export interface IssuedAdminSession {
  cookie: string
  csrfToken: string
  expiresAt: string
}

export interface SessionServiceDependencies {
  repository: AdminSessionRepository
  now: () => Date
  ttlMs?: number
  randomToken?: () => string
}

export class AdminSessionService {
  private readonly ttlMs: number

  constructor(private readonly dependencies: SessionServiceDependencies) {
    this.ttlMs = dependencies.ttlMs ?? 2 * 60 * 60 * 1000
  }

  async issue(): Promise<IssuedAdminSession> {
    const rawSession = this.dependencies.randomToken?.() ?? randomBytes(32).toString('base64url')
    const rawCsrf = this.dependencies.randomToken?.() ?? randomBytes(32).toString('base64url')
    const now = this.dependencies.now()
    const expiresAt = new Date(now.getTime() + this.ttlMs).toISOString()
    const record: AdminSessionRecord = {
      id: sha256(rawSession),
      csrfTokenHash: sha256(rawCsrf),
      createdAt: now.toISOString(),
      expiresAt,
      revokedAt: null,
    }
    await this.dependencies.repository.createSession(record)
    return {
      cookie: `${SESSION_COOKIE}=${rawSession}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(this.ttlMs / 1000)}`,
      csrfToken: rawCsrf,
      expiresAt,
    }
  }

  async authenticate(cookieHeader: string | undefined): Promise<AdminSessionRecord> {
    const rawSession = parseCookie(cookieHeader, SESSION_COOKIE)
    if (!rawSession) throw new ApiError(401, 'ADMIN_UNAUTHORIZED', '管理会话已失效，请重新登录')
    const session = await this.dependencies.repository.getSession(sha256(rawSession))
    const nowIso = this.dependencies.now().toISOString()
    if (!session || session.revokedAt || session.expiresAt <= nowIso) {
      throw new ApiError(401, 'ADMIN_UNAUTHORIZED', '管理会话已失效，请重新登录')
    }
    return session
  }

  async authenticateWrite(cookieHeader: string | undefined, csrfToken: string | undefined): Promise<AdminSessionRecord> {
    const session = await this.authenticate(cookieHeader)
    if (!csrfToken || sha256(csrfToken) !== session.csrfTokenHash) {
      throw new ApiError(403, 'CSRF_REJECTED', '安全校验失败，请刷新页面后重试')
    }
    return session
  }

  async refreshCsrf(cookieHeader: string | undefined): Promise<{ session: AdminSessionRecord; csrfToken: string }> {
    const session = await this.authenticate(cookieHeader)
    const csrfToken = this.dependencies.randomToken?.() ?? randomBytes(32).toString('base64url')
    await this.dependencies.repository.updateCsrfTokenHash(session.id, sha256(csrfToken))
    return { session: { ...session, csrfTokenHash: sha256(csrfToken) }, csrfToken }
  }

  async revoke(cookieHeader: string | undefined): Promise<void> {
    const rawSession = parseCookie(cookieHeader, SESSION_COOKIE)
    if (rawSession) await this.dependencies.repository.revokeSession(sha256(rawSession), this.dependencies.now().toISOString())
  }

  clearCookie(): string {
    return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  }
}

export function parseCookie(header: string | undefined, name: string): string | null {
  for (const part of header?.split(';') ?? []) {
    const [key, ...valueParts] = part.trim().split('=')
    if (key === name) return valueParts.join('=') || null
  }
  return null
}
