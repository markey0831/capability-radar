import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import process from 'node:process'

const require = createRequire(import.meta.url)

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const envId = argument('--env')
if (!envId) throw new Error('请使用 --env <CloudBase 环境 ID> 指定环境')

const cliBin = process.env.CLOUDBASE_CLI_BIN
  || require.resolve('@cloudbase/cli/bin/cloudbase', { paths: [process.env.APPDATA + '\\npm\\node_modules'] })

function runCli(args) {
  const result = spawnSync(process.execPath, [cliBin, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim()
    throw new Error(`CLI 执行失败（exit ${result.status}）：${detail}`)
  }
  return result.stdout
}

const mode = argument('--mode') || 'create'
const schema = JSON.parse(await readFile(new URL('../indexes.json', import.meta.url), 'utf8'))

for (const definition of schema.collections) {
  const name = definition.name
  const command = mode === 'drop'
    ? { drop: name }
    : { create: name }
  const payload = JSON.stringify([{
    TableName: name,
    CommandType: 'COMMAND',
    Command: JSON.stringify(command),
  }])
  try {
    const output = runCli(['db', 'nosql', 'execute', '--command', payload, '-e', envId, '--json'])
    process.stdout.write(`${mode === 'drop' ? '已删除' : '已创建'}集合：${name}\n`)
    if (process.argv.includes('--verbose')) process.stdout.write(output + '\n')
  } catch (error) {
    const text = String(error?.message ?? error)
    if (mode === 'create' && /already exists|已存在|DATABASE_COLLECTION_EXIST|namespace exists/i.test(text)) {
      process.stdout.write(`集合已存在：${name}\n`)
      continue
    }
    if (mode === 'drop' && /not found|不存在|namespace not found|DATABASE_COLLECTION_NOT_EXIST/i.test(text)) {
      process.stdout.write(`集合不存在，跳过删除：${name}\n`)
      continue
    }
    throw error
  }
}

process.stdout.write(`\n${mode === 'drop' ? '删除' : '创建'}集合完成。\n`)
