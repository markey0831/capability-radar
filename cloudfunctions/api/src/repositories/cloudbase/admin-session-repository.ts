import type { AdminSessionRecord, AdminSessionRepository } from '../contracts'

export class CloudBaseAdminSessionRepository implements AdminSessionRepository {
  constructor(private readonly database: any) {}

  async createSession(session: AdminSessionRecord): Promise<void> {
    await this.database.collection('admin_sessions').doc(session.id).set(session)
  }

  async getSession(sessionId: string): Promise<AdminSessionRecord | null> {
    try {
      const result = await this.database.collection('admin_sessions').doc(sessionId).get()
      return Array.isArray(result.data) ? result.data[0] ?? null : result.data ?? null
    } catch (error) {
      if (error instanceof Error && /not[ -]?found|does not exist|DOCUMENT_NOT_FOUND/i.test(error.message)) return null
      throw error
    }
  }

  async updateCsrfTokenHash(sessionId: string, csrfTokenHash: string): Promise<void> {
    await this.database.collection('admin_sessions').doc(sessionId).update({ csrfTokenHash })
  }

  async revokeSession(sessionId: string, revokedAt: string): Promise<void> {
    try {
      await this.database.collection('admin_sessions').doc(sessionId).update({ revokedAt })
    } catch (error) {
      if (!(error instanceof Error) || !/not[ -]?found|does not exist|DOCUMENT_NOT_FOUND/i.test(error.message)) throw error
    }
  }
}
