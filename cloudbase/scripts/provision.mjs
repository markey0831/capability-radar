import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import process from 'node:process'

const require = createRequire(import.meta.url)
const cloudbase = require('../../cloudfunctions/api/node_modules/@cloudbase/node-sdk')
const schema = JSON.parse(await readFile(new URL('../indexes.json', import.meta.url), 'utf8'))

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const envId = argument('--env')
const confirmed = argument('--confirm-env')
if (!envId) throw new Error('请使用 --env <CloudBase环境ID> 指定测试环境')
if (confirmed !== envId) throw new Error('为避免误操作，请同时使用 --confirm-env <同一环境ID>')
if (/prod|production/i.test(envId) && !process.argv.includes('--allow-production')) {
  throw new Error('默认禁止初始化疑似生产环境；生产环境还需显式添加 --allow-production')
}

const app = cloudbase.init({ env: envId })
const database = app.database()
for (const collection of schema.collections) {
  try {
    await database.createCollection(collection.name)
    process.stdout.write(`已创建集合：${collection.name}\n`)
  } catch (error) {
    if (!/already exists|已存在|DATABASE_COLLECTION_EXIST/i.test(String(error?.message ?? error))) throw error
    process.stdout.write(`集合已存在：${collection.name}\n`)
  }
}

process.stdout.write('\n集合初始化完成。Node SDK 不提供服务端索引管理方法，请依据 cloudbase/indexes.json 在 CloudBase 控制台创建并核对索引。\n')
