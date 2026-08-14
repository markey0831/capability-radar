import type { AdminSessionRecord, AdminSessionRepository } from '../contracts'

export class MemoryAdminSessionRepository implements AdminSessionRepository {
  readonly sessions = new Map<string, AdminSessionRecord>()

  async createSession(session: AdminSessionRecord): Promise<void> {
    this.sessions.set(session.id, structuredClone(session))
  }

  async getSession(sessionId: string): Promise<AdminSessionRecord | null> {
    const session = this.sessions.get(sessionId)
    return session ? structuredClone(session) : null
  }

  async updateCsrfTokenHash(sessionId: string, csrfTokenHash: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (session) this.sessions.set(sessionId, { ...session, csrfTokenHash })
  }

  async revokeSession(sessionId: string, revokedAt: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (session) this.sessions.set(sessionId, { ...session, revokedAt })
  }
}
