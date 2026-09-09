import { QUESTION_BANK as DEFAULT_BANK } from '../../../shared/question-bank/load'
import type { QuestionBank, QuestionBankRole } from '../../../shared/question-bank/schema'

let current: QuestionBank = DEFAULT_BANK
let loadPromise: Promise<void> | null = null

export function getQuestionBank(): QuestionBank {
  return current
}

export function getRole(roleId: string): QuestionBankRole | undefined {
  return current.roles.find((role) => role.id === roleId)
}

export function hasRole(roleId: string): boolean {
  return current.roles.some((role) => role.id === roleId)
}

export function setQuestionBank(bank: QuestionBank): void {
  current = bank
}

export async function ensureQuestionBankLoaded(load: () => Promise<QuestionBank | null>, save: (bank: QuestionBank) => Promise<void>): Promise<void> {
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    const stored = await load()
    if (stored) {
      current = stored
    } else {
      await save(DEFAULT_BANK)
      current = DEFAULT_BANK
    }
  })().catch((error) => {
    loadPromise = null
    throw error
  })
  return loadPromise
}
