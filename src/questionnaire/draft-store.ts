import type { AnswerCode } from '../../shared/question-bank/schema'

export interface QuestionnaireDraft {
  answers: Record<string, AnswerCode>
  dimensionIndex: number
  savedAt: string
}

export function questionnaireDraftKey(batchId: string, taskId: string, questionnaireVersion: string): string {
  return `capability-radar:draft:${batchId}:${taskId}:${questionnaireVersion}`
}

export class DraftStore {
  private readonly storage: Storage

  constructor(storage: Storage = window.localStorage) {
    this.storage = storage
  }

  load(key: string): QuestionnaireDraft | null {
    try {
      const raw = this.storage.getItem(key)
      if (!raw) return null
      const parsed = JSON.parse(raw) as Partial<QuestionnaireDraft>
      if (typeof parsed.dimensionIndex !== 'number' || typeof parsed.savedAt !== 'string' || !parsed.answers || typeof parsed.answers !== 'object') {
        return null
      }
      return {
        answers: parsed.answers as Record<string, AnswerCode>,
        dimensionIndex: parsed.dimensionIndex,
        savedAt: parsed.savedAt,
      }
    } catch {
      return null
    }
  }

  save(key: string, draft: QuestionnaireDraft): void {
    try {
      this.storage.setItem(key, JSON.stringify(draft))
    } catch {
      // 忽略浏览器禁用本地存储的场景。
    }
  }

  clear(key: string): void {
    try {
      this.storage.removeItem(key)
    } catch {
      // 忽略浏览器禁用本地存储的场景。
    }
  }
}
