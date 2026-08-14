import type {
  AssignmentRecord,
  BatchRecord,
  CreateSubmissionInput,
  CreateSubmissionResult,
  ParticipantRecord,
  PersonRecord,
  PublicRepository,
  SubmissionRecord,
} from '../contracts'

export interface MemoryRepositorySeed {
  people?: PersonRecord[]
  batches?: BatchRecord[]
  participants?: ParticipantRecord[]
  assignments?: AssignmentRecord[]
  submissions?: SubmissionRecord[]
}

export class MemoryPublicRepository implements PublicRepository {
  readonly people = new Map<string, PersonRecord>()
  readonly batches = new Map<string, BatchRecord>()
  readonly participants = new Map<string, ParticipantRecord>()
  readonly assignments = new Map<string, AssignmentRecord>()
  readonly submissions = new Map<string, SubmissionRecord>()
  private transactionQueue: Promise<void> = Promise.resolve()

  constructor(seed: MemoryRepositorySeed = {}) {
    for (const value of seed.people ?? []) this.people.set(value.id, structuredClone(value))
    for (const value of seed.batches ?? []) this.batches.set(value.id, structuredClone(value))
    for (const value of seed.participants ?? []) this.participants.set(value.id, structuredClone(value))
    for (const value of seed.assignments ?? []) this.assignments.set(value.id, structuredClone(value))
    for (const value of seed.submissions ?? []) this.submissions.set(value.id, structuredClone(value))
  }

  async findOpenBatchByRole(roleId: string, now: string): Promise<BatchRecord | null> {
    return [...this.batches.values()].find((batch) =>
      batch.roleId === roleId
      && batch.status === 'open'
      && batch.startsAt <= now
      && batch.deadlineAt > now
    ) ?? null
  }

  async findAssignmentsByIdentity(
    batchId: string,
    normalizedName: string,
    normalizedDepartment: string,
  ): Promise<AssignmentRecord[]> {
    return [...this.assignments.values()]
      .filter((assignment) =>
        assignment.batchId === batchId
        && assignment.normalizedRaterName === normalizedName
        && assignment.normalizedRaterDepartment === normalizedDepartment
        && assignment.status !== 'cancelled'
      )
      .map((value) => structuredClone(value))
  }

  async getParticipant(participantId: string): Promise<ParticipantRecord | null> {
    const value = this.participants.get(participantId)
    return value ? structuredClone(value) : null
  }

  async getAssignment(assignmentId: string): Promise<AssignmentRecord | null> {
    const value = this.assignments.get(assignmentId)
    return value ? structuredClone(value) : null
  }

  async createSubmissionAtomic(input: CreateSubmissionInput): Promise<CreateSubmissionResult> {
    const previous = this.transactionQueue
    let release!: () => void
    this.transactionQueue = new Promise<void>((resolve) => { release = resolve })
    await previous
    try {
      const replay = [...this.submissions.values()].find(
        (submission) => submission.idempotencyKey === input.submission.idempotencyKey,
      )
      if (replay) return { status: 'idempotent-replay', submission: structuredClone(replay) }
      const assignment = this.assignments.get(input.submission.assignmentId)
      if (!assignment) return { status: 'not-found' }
      if (assignment.status !== input.expectedAssignmentStatus || assignment.currentSubmissionId) {
        return { status: 'already-submitted', submittedAt: assignment.submittedAt }
      }
      this.submissions.set(input.submission.id, structuredClone(input.submission))
      this.assignments.set(assignment.id, {
        ...assignment,
        status: 'submitted',
        currentSubmissionId: input.submission.id,
        submittedAt: input.submission.submittedAt,
      })
      return { status: 'created', submission: structuredClone(input.submission) }
    } finally {
      release()
    }
  }
}
