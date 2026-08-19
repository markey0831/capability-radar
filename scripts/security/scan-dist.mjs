import { readdir, readFile } from 'node:fs/promises'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const distDir = join(root, 'dist')

const forbiddenMarkers = [
  { name: 'ADMIN_PASSWORD_SALT', pattern: /ADMIN_PASSWORD_SALT/i },
  { name: 'ADMIN_PASSWORD_HASH', pattern: /ADMIN_PASSWORD_HASH/i },
  { name: 'SESSION_SIGNING_KEY', pattern: /SESSION_SIGNING_KEY/i },
  { name: 'TASK_TOKEN_SIGNING_KEY', pattern: /TASK_TOKEN_SIGNING_KEY/i },
  { name: 'BACKUP_ENCRYPTION_KEY', pattern: /BACKUP_ENCRYPTION_KEY/i },
  { name: 'CLOUDBASE_ENV_ID', pattern: /CLOUDBASE_ENV_ID/i },
  { name: 'replace-with-generated-salt', pattern: /replace-with-generated-(salt|scrypt-hash)/i },
  { name: 'replace-with-at-least-32-random-bytes', pattern: /replace-with-at-least-32-random-bytes/i },
  { name: 'replace-with-32-byte-base64-key', pattern: /replace-with-32-byte-base64-key/i },
  { name: 'replace-with-cloudbase-env-id', pattern: /replace-with-cloudbase-env-id/i },
]

const textExtensions = new Set(['.html', '.css', '.js', '.mjs', '.cjs', '.json', '.txt', '.svg', '.map', '.md'])

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(fullPath))
    else if (entry.isFile()) files.push(fullPath)
  }
  return files
}

let failures = 0
for (const file of await walk(distDir)) {
  if (!textExtensions.has(extname(file).toLowerCase())) continue
  const content = await readFile(file, 'utf8')
  for (const marker of forbiddenMarkers) {
    if (marker.pattern.test(content)) {
      console.error(`[security:scan] ${relative(root, file)} 包含敏感标记：${marker.name}`)
      failures += 1
    }
  }
}

if (failures > 0) {
  console.error(`[security:scan] 发现 ${failures} 处敏感标记，禁止发布。`)
  process.exit(1)
}

console.log('[security:scan] OK：dist 中未发现密钥占位符或环境变量敏感标记。')
