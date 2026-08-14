import { randomBytes, scrypt as scryptCallback } from 'node:crypto'
import { promisify } from 'node:util'
import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'

const readline = createInterface({ input: stdin, output: stdout })
try {
  const password = await readline.question('请输入新的管理员密码（输入会显示在当前终端）：')
  if (password.length < 12) throw new Error('管理员密码至少需要12个字符')
  const salt = randomBytes(16)
  const hash = await promisify(scryptCallback)(password, salt, 64)
  stdout.write('\n请将以下两项复制到 CloudBase 环境变量，不要写进前端或提交到仓库：\n')
  stdout.write(`ADMIN_PASSWORD_SALT=${salt.toString('hex')}\n`)
  stdout.write(`ADMIN_PASSWORD_HASH=${Buffer.from(hash).toString('hex')}\n`)
} finally {
  readline.close()
}
