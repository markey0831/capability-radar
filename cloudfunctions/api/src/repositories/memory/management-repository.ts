import { MemoryPublicRepository, type MemoryRepositorySeed } from './public-repository'
import type {
  AssignmentRecord,
  AuditLogRecord,
  AuditRepository,
  BatchRecord,
  ManagementRepository,
  ParticipantRecord,
  PersonRecord,
  RoleActiveBatchRecord,
  ResultSnapshotRecord,
  ResultsRepository,
  SubmissionRecord,
} from '../contracts'

export class MemoryManagementRepository extends MemoryPublicRepository implements ManagementRepository, ResultsRepository, AuditRepository {
  readonly activeBatches = new Map<string, RoleActiveBatchRecord>()
  readonly snapshots = new Map<string, ResultSnapshotRecord>()
  readonly auditLogs = new Map<string, AuditLogRecord>()

  constructor(seed: MemoryRepositorySeed = {}) {
    super(seed)
  }

  async listPeople(): Promise<PersonRecord[]> {
    return [...this.people.values()].map((value) => structuredClone(value))
  }

  async listBatches(): Promise<BatchRecord[]> {
    return [...this.batches.values()].map((value) => structuredClone(value))
  }

  async appendAuditLog(record: AuditLogRecord): Promise<void> {
    this.auditLogs.set(record.id, structuredClone(record))
  }

  async getPerson(personId: string): Promise<PersonRecord | null> {
    const value = this.people.get(personId)
    return value ? structuredClone(value) : null
  }

  async savePerson(person: PersonRecord): Promise<void> {
    this.people.set(person.id, structuredClone(person))
  }

  async deletePerson(personId: string): Promise<void> {
    this.people.delete(personId)
  }

  async getBatch(batchId: string): Promise<BatchRecord | null> {
    const value = this.batches.get(batchId)
    return value ? structuredClone(value) : null
  }

  async saveBatch(batch: BatchRecord): Promise<void> {
    this.batches.set(batch.id, structuredClone(batch))
  }

  async listParticipants(batchId: string): Promise<ParticipantRecord[]> {
    return [...this.participants.values()].filter((value) => value.batchId === batchId).map((value) => structuredClone(value))
  }

  async saveParticipant(participant: ParticipantRecord): Promise<void> {
    this.participants.set(participant.id, structuredClone(participant))
  }

  async listAssignments(batchId: string): Promise<AssignmentRecord[]> {
    return [...this.assignments.values()].filter((value) => value.batchId === batchId).map((value) => structuredClone(value))
  }

  async saveAssignment(assignment: AssignmentRecord): Promise<void> {
    const duplicate = [...this.assignments.values()].find((candidate) =>
      candidate.id !== assignment.id
      && candidate.batchId === assignment.batchId
      && candidate.participantId === assignment.participantId
      && candidate.raterPersonId === assignment.raterPersonId,
    )
    if (duplicate) throw new Error('DUPLICATE_ASSIGNMENT')
    this.assignments.set(assignment.id, structuredClone(assignment))
  }

  async openBatchAtomic(batchId: string, roleId: string, openedAt: string) {
    const batch = this.batches.get(batchId)
    if (!batch) return 'not-found' as const
    if (batch.status !== 'draft') return 'invalid-status' as const
    if (this.activeBatches.has(roleId)) return 'role-already-open' as const
    this.batches.set(batchId, { ...batch, status: 'open' })
    this.activeBatches.set(roleId, { roleId, batchId, openedAt })
    return 'opened' as const
  }

  async listSubmissions(batchId: string, participantId?: string): Promise<SubmissionRecord[]> {
    return [...this.submissions.values()]
      .filter((value) => value.batchId === batchId && (!participantId || value.participantId === participantId))
      .map((value) => structuredClone(value))
  }

  async listResultSnapshots(batchId: string, participantId?: string): Promise<ResultSnapshotRecord[]> {
    return [...this.snapshots.values()]
      .filter((value) => value.batchId === batchId && (!participantId || value.participantId === participantId))
      .map((value) => structuredClone(value))
  }

  async closeBatchAtomic(batchId: string, snapshots: ResultSnapshotRecord[], _closedAt: string) {
    const batch = this.batches.get(batchId)
    if (!batch) return 'not-found' as const
    if (batch.status !== 'open') return 'invalid-status' as const
    this.batches.set(batchId, { ...batch, status: 'closed' })
    this.activeBatches.delete(batch.roleId)
    for (const snapshot of snapshots) this.snapshots.set(snapshot.id, structuredClone(snapshot))
    return 'closed' as const
  }

  async reopenBatchAtomic(batchId: string, _reopenedAt: string) {
    const batch = this.batches.get(batchId)
    if (!batch) return 'not-found' as const
    if (batch.status !== 'closed') return 'invalid-status' as const
    if (this.activeBatches.has(batch.roleId)) return 'role-already-open' as const
    this.batches.set(batchId, { ...batch, status: 'open' })
    this.activeBatches.set(batch.roleId, { roleId: batch.roleId, batchId, openedAt: _reopenedAt })
    for (const [id, snapshot] of this.snapshots) {
      if (snapshot.batchId === batchId && snapshot.status === 'active') {
        this.snapshots.set(id, { ...snapshot, status: 'invalidated' })
      }
    }
    return 'reopened' as const
  }

  async voidSubmissionAtomic(submissionId: string, reason: string, voidedAt: string) {
    const submission = this.submissions.get(submissionId)
    if (!submission) return 'not-found' as const
    if (submission.status === 'voided') return 'already-voided' as const
    const batch = this.batches.get(submission.batchId)
    if (!batch || batch.status !== 'open') return 'batch-closed' as const
    const assignment = this.assignments.get(submission.assignmentId)
    this.submissions.set(submissionId, { ...submission, status: 'voided', voidReason: reason, voidedAt })
    if (assignment?.currentSubmissionId === submissionId) {
      this.assignments.set(assignment.id, { ...assignment, status: 'pending', currentSubmissionId: null, submittedAt: null })
    }
    return 'voided' as const
  }
}
