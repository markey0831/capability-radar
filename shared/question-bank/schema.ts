export const ANSWER_CODES = ['A', 'B', 'C', 'D', 'E', 'UNABLE'] as const
export type AnswerCode = (typeof ANSWER_CODES)[number]

export interface QuestionBankQuestion {
  id: string
  focus: string
  prompt: string
  options: Record<Exclude<AnswerCode, 'UNABLE'>, string>
}

export interface QuestionBankDimension {
  id: string
  name: string
  category: '通用基础能力' | '专业核心能力' | '职业素养能力'
  description: string
  questions: readonly QuestionBankQuestion[]
}

export interface QuestionBankRole {
  id: string
  legacyCode: string
  name: string
  positioning: string
  period: string
  dimensions: readonly QuestionBankDimension[]
}

export interface QuestionBank {
  schemaVersion: 1
  version: string
  checksum: string
  answerScale: Record<AnswerCode, number | null>
  roles: readonly QuestionBankRole[]
}
