import { describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { buildBackupManifest, decryptBackup, encryptBackup } from './backup-core'

describe('backup core', () => {
  it('builds a manifest with collection counts', () => {
    const manifest = buildBackupManifest({ people: [{ name: '张三' }], submissions: [] }, '2026-08-14T00:00:00.000Z')
    expect(manifest).toEqual({
      version: 1,
      exportedAt: '2026-08-14T00:00:00.000Z',
      collections: [
        { name: 'people', count: 1 },
        { name: 'submissions', count: 0 },
      ],
    })
  })

  it('encrypts and decrypts a roundtrip without exposing plaintext', () => {
    const key = randomBytes(32)
    const plaintext = Buffer.from(JSON.stringify({ name: '张三', department: '销售部' }), 'utf8')
    const encrypted = encryptBackup(plaintext, key)
    expect(encrypted.ciphertext).not.toContain('张三')
    expect(decryptBackup(encrypted, key).toString('utf8')).toBe(JSON.stringify({ name: '张三', department: '销售部' }))
  })
})
