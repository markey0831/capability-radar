import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export interface BackupManifest {
  version: 1
  exportedAt: string
  collections: Array<{ name: string; count: number }>
}

export interface EncryptedBackup {
  iv: string
  authTag: string
  ciphertext: string
}

export function buildBackupManifest(collections: Record<string, unknown[]>, exportedAt = new Date().toISOString()): BackupManifest {
  return {
    version: 1,
    exportedAt,
    collections: Object.entries(collections).map(([name, documents]) => ({ name, count: documents.length })),
  }
}

export function encryptBackup(plaintext: Buffer, key: Buffer): EncryptedBackup {
  if (key.length !== 32) throw new Error('备份密钥必须是32字节')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return {
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }
}

export function decryptBackup(encrypted: EncryptedBackup, key: Buffer): Buffer {
  if (key.length !== 32) throw new Error('备份密钥必须是32字节')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(encrypted.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(encrypted.ciphertext, 'base64')), decipher.final()])
}
