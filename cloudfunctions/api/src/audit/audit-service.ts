import { randomUUID } from 'node:crypto'
import type { AuditRepository } from '../repositories/contracts'
import { ApiError } from '../http/errors'

export class AuditService {
  constructor(
    private readonly repository: AuditRepository,
    private readonly now: () => Date,
    private readonly createId: () => string = randomUUID,
  ) {}

  async run<T>(input: {
    action: string
    targetType: string
    targetId: string
    actorSessionId: string
    requestId: string
  }, action: () => Promise<T>): Promise<T> {
    try {
      const result = await action()
      await this.repository.appendAuditLog({
        id: this.createId(),
        ...input,
        outcome: 'success',
        errorCode: null,
        createdAt: this.now().toISOString(),
      })
      return result
    } catch (error) {
      try {
        await this.repository.appendAuditLog({
          id: this.createId(),
          ...input,
          outcome: 'failure',
          errorCode: error instanceof ApiError ? error.code : 'INTERNAL_ERROR',
          createdAt: this.now().toISOString(),
        })
      } catch {
        // Preserve the original error and never serialize credentials or request bodies into audit logs.
      }
      throw error
    }
  }
}
