import { describe, expect, it } from 'vitest'
import { MemoryAdminSessionRepository } from '../repositories/memory/admin-session-repository'
import { hashAdminPassword, verifyAdminPassword } from './password'
import { AdminSessionService } from './session'

describe('admin security', () => {
  it('verifies a scrypt password hash', async () => {
    const salt = '00112233445566778899aabbccddeeff'
    const hash = await hashAdminPassword('correct horse battery staple', salt)
    expect(hash).toHaveLength(128)
    expect(await verifyAdminPassword('correct horse battery staple', salt, hash)).toBe(true)
    expect(await verifyAdminPassword('wrong password', salt, hash)).toBe(false)
  })

  it('stores only session and CSRF hashes, then expires and revokes sessions', async () => {
    const repository = new MemoryAdminSessionRepository()
    let now = new Date('2026-08-13T08:00:00.000Z')
    const tokens = ['raw-session-secret', 'raw-csrf-secret']
    const service = new AdminSessionService({
      repository,
      now: () => now,
      ttlMs: 1_000,
      randomToken: () => tokens.shift()!,
    })
    const issued = await service.issue()
    expect(issued.cookie).toContain('HttpOnly')
    expect(issued.cookie).toContain('Secure')
    expect(issued.cookie).toContain('SameSite=Lax')
    expect(JSON.stringify([...repository.sessions.values()])).not.toContain('raw-session-secret')
    expect(JSON.stringify([...repository.sessions.values()])).not.toContain('raw-csrf-secret')

    const cookieHeader = issued.cookie.split(';')[0]
    await expect(service.authenticateWrite(cookieHeader, issued.csrfToken)).resolves.toBeTruthy()
    await expect(service.authenticateWrite(cookieHeader, 'wrong')).rejects.toMatchObject({ code: 'CSRF_REJECTED' })
    const refreshTokens = ['refreshed-csrf-secret']
    const refreshService = new AdminSessionService({ repository, now: () => now, ttlMs: 1_000, randomToken: () => refreshTokens.shift()! })
    const refreshed = await refreshService.refreshCsrf(cookieHeader)
    expect(refreshed.csrfToken).toBe('refreshed-csrf-secret')
    expect(JSON.stringify([...repository.sessions.values()])).not.toContain('refreshed-csrf-secret')
    await expect(refreshService.authenticateWrite(cookieHeader, issued.csrfToken)).rejects.toMatchObject({ code: 'CSRF_REJECTED' })
    await expect(refreshService.authenticateWrite(cookieHeader, refreshed.csrfToken)).resolves.toBeTruthy()
    await service.revoke(cookieHeader)
    await expect(service.authenticate(cookieHeader)).rejects.toMatchObject({ code: 'ADMIN_UNAUTHORIZED' })

    const secondTokens = ['session-2', 'csrf-2']
    const secondService = new AdminSessionService({ repository, now: () => now, ttlMs: 1_000, randomToken: () => secondTokens.shift()! })
    const second = await secondService.issue()
    now = new Date('2026-08-13T08:00:02.000Z')
    await expect(secondService.authenticate(second.cookie.split(';')[0])).rejects.toMatchObject({ code: 'ADMIN_UNAUTHORIZED' })
  })
})
