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
if (!envId) throw new Error('请使用 --env <CloudBase环境ID>')
const schema = JSON.parse(await readFile(new URL('../indexes.json', import.meta.url), 'utf8'))
const raw = await readFile(new URL('../seed/questionnaire-v1.json', import.meta.url), 'utf8')
const bank = JSON.parse(raw)
const checksum = createHash('sha256').update(raw).digest('hex')
const credentials = process.env.CLOUDBASE_SECRET_ID && process.env.CLOUDBASE_SECRET_KEY
  ? { secretId: process.env.CLOUDBASE_SECRET_ID, secretKey: process.env.CLOUDBASE_SECRET_KEY, sessionToken: process.env.CLOUDBASE_TOKEN }
  : {}
const database = cloudbase.init({ env: envId, region: process.env.CLOUDBASE_REGION, ...credentials }).database()

let failed = false
for (const definition of schema.collections) {
  try {
    await database.collection(definition.name).limit(1).get()
    process.stdout.write(`通过 集合可读：${definition.name}\n`)
  } catch (error) {
    failed = true
    process.stderr.write(`失败 集合不可读：${definition.name}（${String(error?.message ?? error)}）\n`)
  }
}

for (const role of bank.roles) {
  const id = `${role.id}__${bank.version}`
  try {
    const result = await database.collection('questionnaire_versions').doc(id).get()
    const record = Array.isArray(result.data) ? result.data[0] : result.data
    if (!record || record.bankChecksum !== checksum) throw new Error('摘要不一致')
    process.stdout.write(`通过 题库摘要：${id}\n`)
  } catch (error) {
    failed = true
    process.stderr.write(`失败 题库核验：${id}（${String(error?.message ?? error)}）\n`)
  }
}

process.stdout.write('\n注意：服务端 SDK 无索引枚举接口，索引还需在控制台逐项对照 cloudbase/indexes.json。\n')
if (failed) process.exitCode = 1
