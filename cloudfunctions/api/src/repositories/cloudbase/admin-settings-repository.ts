import type { QuestionBank } from '../../../../../shared/question-bank/schema'
import type { AdminPasswordRecord, AdminSettingsRepository } from '../contracts'

export class CloudBaseAdminSettingsRepository implements AdminSettingsRepository {
  constructor(private readonly database: any) {}

  async getAdminPassword(): Promise<AdminPasswordRecord | null> {
    try {
      const result = await this.database.collection('admin_settings').doc('admin_password').get()
      const record = Array.isArray(result.data) ? result.data[0] : result.data
      return record ?? null
    } catch (error) {
      if (this.isMissingDocument(error)) return null
      throw error
    }
  }

  async saveAdminPassword(record: AdminPasswordRecord): Promise<void> {
    await this.database.collection('admin_settings').doc(record.id).set(record)
  }

  async getQuestionBank(): Promise<QuestionBank | null> {
    try {
      const result = await this.database.collection('admin_settings').doc('question_bank').get()
      const record = Array.isArray(result.data) ? result.data[0] : result.data
      return record?.bank ?? null
    } catch (error) {
      if (this.isMissingDocument(error)) return null
      throw error
    }
  }

  async saveQuestionBank(bank: QuestionBank): Promise<void> {
    await this.database.collection('admin_settings').doc('question_bank').set({
      id: 'question_bank',
      bank,
      updatedAt: new Date().toISOString(),
    })
  }

  private isMissingDocument(error: unknown): boolean {
    return error instanceof Error && /not[ -]?found|does not exist|DOCUMENT_NOT_FOUND/i.test(error.message)
  }
}
