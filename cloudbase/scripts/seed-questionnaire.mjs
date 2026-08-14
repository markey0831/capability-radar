import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import process from 'node:process'

const require = createRequire(import.meta.url)
const cloudbase = require('../../cloudfunctions/api/node_modules/@cloudbase/node-sdk')

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const envId = argument('--env')
const confirmed = argument('--confirm-env')
if (!envId || confirmed !== envId) throw new Error('请同时使用 --env <环境ID> --confirm-env <同一环境ID>')

const raw = await readFile(new URL('../seed/questionnaire-v1.json', import.meta.url), 'utf8')
const bank = JSON.parse(raw)
const checksum = createHash('sha256').update(raw).digest('hex')
const app = cloudbase.init({ env: envId })
const collection = app.database().collection('questionnaire_versions')

for (const role of bank.roles) {
  const id = `${role.id}__${bank.version}`
  let existing = null
  try {
    const result = await collection.doc(id).get()
    existing = Array.isArray(result.data) ? result.data[0] : result.data
  } catch (error) {
    if (!/not[ -]?found|does not exist|DOCUMENT_NOT_FOUND/i.test(String(error?.message ?? error))) throw error
  }
  if (existing) {
    if (existing.bankChecksum !== checksum) throw new Error(`题库 ${id} 已存在但摘要不同，拒绝覆盖`)
    process.stdout.write(`题库已存在且摘要一致：${id}\n`)
    continue
  }
  await collection.doc(id).set({ data: {
    id,
    roleId: role.id,
    version: bank.version,
    status: 'published',
    scoringVersion: 'v1',
    bankChecksum: checksum,
    sourceChecksum: bank.checksum,
    dimensions: role.dimensions,
    publishedAt: new Date().toISOString(),
  } })
  process.stdout.write(`已发布题库：${id}\n`)
}
