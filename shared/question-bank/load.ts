import rawQuestionBank from './v1.json'
import type { QuestionBank } from './schema'

function requireCondition(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`题库格式错误：${message}`)
}

export function validateQuestionBank(value: unknown): QuestionBank {
  requireCondition(typeof value === 'object' && value !== null, '根节点必须是对象')
  const bank = value as QuestionBank
  requireCondition(bank.schemaVersion === 1, '不支持的 schemaVersion')
  requireCondition(typeof bank.version === 'string' && bank.version.length > 0, '缺少版本号')
  requireCondition(/^[a-f0-9]{64}$/.test(bank.checksum), 'checksum 必须是 SHA-256')
  requireCondition(Array.isArray(bank.roles) && bank.roles.length === 7, '必须有7个职位')

  const ids = new Set<string>()
  for (const role of bank.roles) {
    requireCondition(!ids.has(role.id), `职位ID重复：${role.id}`)
    ids.add(role.id)
    requireCondition(role.dimensions.length === 6, `${role.name}必须有6个维度`)
    for (const dimension of role.dimensions) {
      requireCondition(!ids.has(dimension.id), `维度ID重复：${dimension.id}`)
      ids.add(dimension.id)
      requireCondition(dimension.questions.length === 5, `${role.name}/${dimension.name}必须有5道题`)
      for (const question of dimension.questions) {
        requireCondition(!ids.has(question.id), `题目ID重复：${question.id}`)
        ids.add(question.id)
        requireCondition(question.prompt.trim().length > 0, `${question.id}缺少题干`)
        for (const code of ['A', 'B', 'C', 'D', 'E'] as const) {
          requireCondition(question.options[code].trim().length > 0, `${question.id}缺少${code}选项`)
        }
      }
    }
  }
  return bank
}

export const QUESTION_BANK = validateQuestionBank(rawQuestionBank)
