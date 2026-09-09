import type {
  AssignmentRecord,
  BatchRecord,
  CreateSubmissionInput,
  CreateSubmissionResult,
  ParticipantRecord,
  PublicRepository,
  SubmissionRecord,
} from '../contracts'

interface CloudBaseQueryResult<T> {
  data?: T[] | T
}

function firstRecord<T>(result: CloudBaseQueryResult<T>): T | null {
  if (Array.isArray(result.data)) return result.data[0] ?? null
  return result.data ?? null
}

function allRecords<T>(result: CloudBaseQueryResult<T>): T[] {
  if (!result.data) return []
  return Array.isArray(result.data) ? result.data : [result.data]
}

export class CloudBasePublicRepository implements PublicRepository {
  constructor(private readonly database: any) {}

  async findOpenBatchByRole(roleId: string, now: string): Promise<BatchRecord | null> {
    const result = await this.database.collection('assessment_batches')
      .where({ roleId })
      .limit(2)
      .get() as CloudBaseQueryResult<BatchRecord>
    const matches = allRecords(result).filter((batch) => batch.status === 'open' && batch.startsAt <= now && batch.deadlineAt > now)
    if (matches.length > 1) throw new Error(`职位 ${roleId} 存在多个开放批次`)
    return matches[0] ?? null
  }

  async findAssignmentsByIdentity(
    batchId: string,
    normalizedName: string,
    normalizedDepartment: string,
  ): Promise<AssignmentRecord[]> {
    const result = await this.database.collection('assignments').where({
      batchId,
      normalizedRaterName: normalizedName,
      normalizedRaterDepartment: normalizedDepartment,
    }).limit(100).get() as CloudBaseQueryResult<AssignmentRecord>
    return allRecords(result).filter((assignment) => assignment.status !== 'cancelled')
  }

  async getParticipant(participantId: string): Promise<ParticipantRecord | null> {
    try {
      return firstRecord(await this.database.collection('batch_participants').doc(participantId).get())
    } catch (error) {
      if (this.isMissingDocument(error)) return null
      throw error
    }
  }

  async getAssignment(assignmentId: string): Promise<AssignmentRecord | null> {
    try {
      return firstRecord(await this.database.collection('assignments').doc(assignmentId).get())
    } catch (error) {
      if (this.isMissingDocument(error)) return null
      throw error
    }
  }

  async createSubmissionAtomic(input: CreateSubmissionInput): Promise<CreateSubmissionResult> {
    const transactionResult = await this.database.runTransaction(async (transaction: any) => {
      const submissionReference = transaction.collection('submissions').doc(input.submission.id)
      try {
        const existing = firstRecord<SubmissionRecord>(await submissionReference.get())
        if (existing) return { status: 'idempotent-replay', submission: existing } satisfies CreateSubmissionResult
      } catch (error) {
        if (!this.isMissingDocument(error)) throw error
      }

      const assignmentReference = transaction.collection('assignments').doc(input.submission.assignmentId)
      let assignment: AssignmentRecord | null = null
      try {
        assignment = firstRecord<AssignmentRecord>(await assignmentReference.get())
      } catch (error) {
        if (!this.isMissingDocument(error)) throw error
      }
      if (!assignment) return { status: 'not-found' } satisfies CreateSubmissionResult
      if (assignment.status !== input.expectedAssignmentStatus || assignment.currentSubmissionId) {
        return { status: 'already-submitted', submittedAt: assignment.submittedAt } satisfies CreateSubmissionResult
      }

      await submissionReference.set(input.submission)
      await assignmentReference.update({
        status: 'submitted',
        currentSubmissionId: input.submission.id,
        submittedAt: input.submission.submittedAt,
        updatedAt: input.submission.submittedAt,
      })
      return { status: 'created', submission: input.submission } satisfies CreateSubmissionResult
    })
    return (transactionResult?.result ?? transactionResult) as CreateSubmissionResult
  }

  private isMissingDocument(error: unknown): boolean {
    if (!(error instanceof Error)) return false
    return /not[ -]?found|does not exist|DOCUMENT_NOT_FOUND/i.test(error.message)
  }
}

export function createCloudBasePublicRepository(): CloudBasePublicRepository {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cloudbase = require('@cloudbase/node-sdk') as any
  const app = cloudbase.init({ env: cloudbase.SYMBOL_DEFAULT_ENV })
  return new CloudBasePublicRepository(app.database())
}
