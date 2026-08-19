import { CloudBasePublicRepository } from './public-repository'
import type {
  AssignmentRecord,
  AuditLogRecord,
  AuditRepository,
  BatchRecord,
  ManagementRepository,
  ParticipantRecord,
  PersonRecord,
  ResultSnapshotRecord,
  ResultsRepository,
  SubmissionRecord,
} from '../contracts'

interface QueryResult<T> {
  data?: T[] | T
}

function all<T>(result: QueryResult<T>): T[] {
  if (!result.data) return []
  return Array.isArray(result.data) ? result.data : [result.data]
}

function first<T>(result: QueryResult<T>): T | null {
  return all(result)[0] ?? null
}

function missing(error: unknown): boolean {
  return error instanceof Error && /not[ -]?found|does not exist|DOCUMENT_NOT_FOUND/i.test(error.message)
}

export class CloudBaseManagementRepository extends CloudBasePublicRepository implements ManagementRepository, ResultsRepository, AuditRepository {
  constructor(private readonly db: any) {
    super(db)
  }

  private async getDocument<T>(collection: string, id: string): Promise<T | null> {
    try {
      return first<T>(await this.db.collection(collection).doc(id).get())
    } catch (error) {
      if (missing(error)) return null
      throw error
    }
  }

  private async list<T>(collection: string, where?: Record<string, unknown>): Promise<T[]> {
    let query = this.db.collection(collection)
    if (where) query = query.where(where)
    return all<T>(await query.limit(1000).get())
  }

  async listPeople(): Promise<PersonRecord[]> {
    return this.list<PersonRecord>('people')
  }

  async listBatches(): Promise<BatchRecord[]> {
    return this.list<BatchRecord>('assessment_batches')
  }

  async getPerson(personId: string): Promise<PersonRecord | null> {
    return this.getDocument<PersonRecord>('people', personId)
  }

  async savePerson(person: PersonRecord): Promise<void> {
    await this.db.collection('people').doc(person.id).set(person)
  }

  async deletePerson(personId: string): Promise<void> {
    await this.db.collection('people').doc(personId).remove()
  }

  async getBatch(batchId: string): Promise<BatchRecord | null> {
    return this.getDocument<BatchRecord>('assessment_batches', batchId)
  }

  async saveBatch(batch: BatchRecord): Promise<void> {
    await this.db.collection('assessment_batches').doc(batch.id).set(batch)
  }

  async listParticipants(batchId: string): Promise<ParticipantRecord[]> {
    return this.list<ParticipantRecord>('batch_participants', { batchId })
  }

  async saveParticipant(participant: ParticipantRecord): Promise<void> {
    await this.db.collection('batch_participants').doc(participant.id).set(participant)
  }

  async listAssignments(batchId: string): Promise<AssignmentRecord[]> {
    return this.list<AssignmentRecord>('assignments', { batchId })
  }

  async saveAssignment(assignment: AssignmentRecord): Promise<void> {
    const duplicates = await this.db.collection('assignments').where({
      batchId: assignment.batchId,
      participantId: assignment.participantId,
      raterPersonId: assignment.raterPersonId,
    }).limit(2).get() as QueryResult<AssignmentRecord>
    if (all(duplicates).some((candidate) => candidate.id !== assignment.id)) throw new Error('DUPLICATE_ASSIGNMENT')
    await this.db.collection('assignments').doc(assignment.id).set(assignment)
  }

  async openBatchAtomic(batchId: string, roleId: string, openedAt: string) {
    const result = await this.db.runTransaction(async (transaction: any) => {
      const batchRef = transaction.collection('assessment_batches').doc(batchId)
      const activeRef = transaction.collection('role_active_batches').doc(roleId)
      let batch: BatchRecord | null = null
      let active: unknown = null
      try { batch = first<BatchRecord>(await batchRef.get()) } catch (error) { if (!missing(error)) throw error }
      if (!batch) return 'not-found' as const
      if (batch.status !== 'draft') return 'invalid-status' as const
      try { active = first(await activeRef.get()) } catch (error) { if (!missing(error)) throw error }
      if (active) return 'role-already-open' as const
      await batchRef.update({ status: 'open', updatedAt: openedAt })
      await activeRef.set({ roleId, batchId, openedAt })
      return 'opened' as const
    })
    return result?.result ?? result
  }

  async listSubmissions(batchId: string, participantId?: string): Promise<SubmissionRecord[]> {
    return this.list<SubmissionRecord>('submissions', participantId ? { batchId, participantId } : { batchId })
  }

  async listResultSnapshots(batchId: string, participantId?: string): Promise<ResultSnapshotRecord[]> {
    return this.list<ResultSnapshotRecord>('result_snapshots', participantId ? { batchId, participantId } : { batchId })
  }

  async closeBatchAtomic(batchId: string, snapshots: ResultSnapshotRecord[], closedAt: string) {
    const result = await this.db.runTransaction(async (transaction: any) => {
      const batchRef = transaction.collection('assessment_batches').doc(batchId)
      let batch: BatchRecord | null = null
      try { batch = first<BatchRecord>(await batchRef.get()) } catch (error) { if (!missing(error)) throw error }
      if (!batch) return 'not-found' as const
      if (batch.status !== 'open') return 'invalid-status' as const
      await batchRef.update({ status: 'closed', closedAt, updatedAt: closedAt })
      await transaction.collection('role_active_batches').doc(batch.roleId).remove()
      for (const snapshot of snapshots) {
        await transaction.collection('result_snapshots').doc(snapshot.id).set(snapshot)
      }
      return 'closed' as const
    })
    return result?.result ?? result
  }

  async reopenBatchAtomic(batchId: string, reopenedAt: string) {
    const snapshots = await this.listResultSnapshots(batchId)
    const result = await this.db.runTransaction(async (transaction: any) => {
      const batchRef = transaction.collection('assessment_batches').doc(batchId)
      let batch: BatchRecord | null = null
      let active: unknown = null
      try { batch = first<BatchRecord>(await batchRef.get()) } catch (error) { if (!missing(error)) throw error }
      if (!batch) return 'not-found' as const
      if (batch.status !== 'closed') return 'invalid-status' as const
      const activeRef = transaction.collection('role_active_batches').doc(batch.roleId)
      try { active = first(await activeRef.get()) } catch (error) { if (!missing(error)) throw error }
      if (active) return 'role-already-open' as const
      await batchRef.update({ status: 'open', closedAt: null, updatedAt: reopenedAt })
      await activeRef.set({ roleId: batch.roleId, batchId, openedAt: reopenedAt })
      for (const snapshot of snapshots.filter((item) => item.status === 'active')) {
        await transaction.collection('result_snapshots').doc(snapshot.id).update({ status: 'invalidated' })
      }
      return 'reopened' as const
    })
    return result?.result ?? result
  }

  async voidSubmissionAtomic(submissionId: string, reason: string, voidedAt: string) {
    const result = await this.db.runTransaction(async (transaction: any) => {
      const submissionRef = transaction.collection('submissions').doc(submissionId)
      let submission: SubmissionRecord | null = null
      try { submission = first<SubmissionRecord>(await submissionRef.get()) } catch (error) { if (!missing(error)) throw error }
      if (!submission) return 'not-found' as const
      if (submission.status === 'voided') return 'already-voided' as const
      const batch = first<BatchRecord>(await transaction.collection('assessment_batches').doc(submission.batchId).get())
      if (!batch || batch.status !== 'open') return 'batch-closed' as const
      await submissionRef.update({ status: 'voided', voidReason: reason, voidedAt, updatedAt: voidedAt })
      await transaction.collection('assignments').doc(submission.assignmentId).update({
        status: 'pending', currentSubmissionId: null, submittedAt: null, updatedAt: voidedAt,
      })
      return 'voided' as const
    })
    return result?.result ?? result
  }

  async appendAuditLog(record: AuditLogRecord): Promise<void> {
    await this.db.collection('audit_logs').doc(record.id).set(record)
  }
}
