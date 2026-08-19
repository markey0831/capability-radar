import { buildBackupManifest, encryptBackup } from './backup-core'

const cloudbase = require('@cloudbase/node-sdk') as any

const COLLECTION_NAMES = [
  'people',
  'questionnaire_versions',
  'assessment_batches',
  'role_active_batches',
  'batch_participants',
  'assignments',
  'submissions',
  'result_snapshots',
  'admin_sessions',
  'audit_logs',
]

export async function main(): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const key = Buffer.from(process.env.BACKUP_ENCRYPTION_KEY ?? '', 'base64')
  if (key.length !== 32) return { ok: false, error: 'BACKUP_ENCRYPTION_KEY 必须是32字节的 base64 密钥' }

  const app = cloudbase.init({ env: cloudbase.SYMBOL_DEFAULT_ENV })
  const database = app.database()
  const collections: Record<string, unknown[]> = {}
  for (const name of COLLECTION_NAMES) {
    const result = await database.collection(name).limit(1000).get()
    const data = result.data ?? []
    collections[name] = Array.isArray(data) ? data : [data]
  }

  const manifest = buildBackupManifest(collections)
  const payload = Buffer.from(JSON.stringify({ manifest, collections }), 'utf8')
  const encrypted = encryptBackup(payload, key)
  const bundle = JSON.stringify({
    manifest,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    ciphertext: encrypted.ciphertext,
  })
  const cloudPath = `backups/${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  const upload = await app.uploadFile({ cloudPath, fileContent: Buffer.from(bundle, 'utf8') })

  return { ok: true, result: { fileId: upload.fileID ?? upload.fileId, cloudPath, manifest } }
}
