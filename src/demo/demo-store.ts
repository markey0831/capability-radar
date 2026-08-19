import type { AnswerCode } from '../../shared/question-bank/schema'
import type { IndividualDimensionScore, RaterLevel } from '../../shared/domain/types'

export interface DemoPerson {
  id: string
  name: string
  normalizedName: string
  department: string
  normalizedDepartment: string
  currentRoleId: string | null
  canBeEvaluatee: boolean
  canBeRater: boolean
  status: 'active' | 'inactive'
}

export interface DemoBatch {
  id: string
  name: string
  roleId: string
  questionnaireVersionId: string
  assessmentDate: string
  startsAt: string
  deadlineAt: string
  status: 'draft' | 'open' | 'closed' | 'archived'
}

export interface DemoParticipant {
  id: string
  batchId: string
  personId: string
  nameSnapshot: string
  departmentSnapshot: string
  roleIdSnapshot: string
  status: 'active' | 'removed'
}

export interface DemoAssignment {
  id: string
  batchId: string
  participantId: string
  raterPersonId: string
  raterNameSnapshot: string
  raterDepartmentSnapshot: string
  normalizedRaterName: string
  normalizedRaterDepartment: string
  level: RaterLevel
  status: 'pending' | 'submitted' | 'cancelled'
  currentSubmissionId: string | null
  submittedAt: string | null
}

export interface DemoSubmission {
  id: string
  assignmentId: string
  batchId: string
  participantId: string
  questionnaireVersionId: string
  scoringVersion: string
  answers: Record<string, AnswerCode>
  dimensionScores: IndividualDimensionScore[]
  idempotencyKey: string
  status: 'active' | 'voided'
  submittedAt: string
  voidReason: string | null
  voidedAt: string | null
}

export class DemoStore {
  readonly people = new Map<string, DemoPerson>()
  readonly batches = new Map<string, DemoBatch>()
  readonly participants = new Map<string, DemoParticipant>()
  readonly assignments = new Map<string, DemoAssignment>()
  readonly submissions = new Map<string, DemoSubmission>()
  private readonly storage?: Storage
  private idCounter = 0

  constructor(storage?: Storage) {
    this.storage = storage
    if (storage) this.load(storage)
  }

  nextId(prefix: string): string {
    this.idCounter += 1
    return `${prefix}-${this.idCounter}`
  }

  listPeople(): DemoPerson[] {
    return [...this.people.values()].map((value) => structuredClone(value))
  }

  savePerson(person: DemoPerson): void {
    this.people.set(person.id, structuredClone(person))
    this.persist()
  }

  getPerson(personId: string): DemoPerson | null {
    const value = this.people.get(personId)
    return value ? structuredClone(value) : null
  }

  deletePerson(personId: string): void {
    this.people.delete(personId)
    this.persist()
  }

  listBatches(): DemoBatch[] {
    return [...this.batches.values()].map((value) => structuredClone(value))
  }

  getBatch(batchId: string): DemoBatch | null {
    const value = this.batches.get(batchId)
    return value ? structuredClone(value) : null
  }

  saveBatch(batch: DemoBatch): void {
    this.batches.set(batch.id, structuredClone(batch))
    this.persist()
  }

  listParticipants(batchId: string): DemoParticipant[] {
    return [...this.participants.values()].filter((value) => value.batchId === batchId).map((value) => structuredClone(value))
  }

  saveParticipant(participant: DemoParticipant): void {
    this.participants.set(participant.id, structuredClone(participant))
    this.persist()
  }

  listAssignments(batchId: string): DemoAssignment[] {
    return [...this.assignments.values()].filter((value) => value.batchId === batchId).map((value) => structuredClone(value))
  }

  saveAssignment(assignment: DemoAssignment): void {
    this.assignments.set(assignment.id, structuredClone(assignment))
    this.persist()
  }

  getAssignment(assignmentId: string): DemoAssignment | null {
    const value = this.assignments.get(assignmentId)
    return value ? structuredClone(value) : null
  }

  listSubmissions(batchId: string, participantId?: string): DemoSubmission[] {
    return [...this.submissions.values()]
      .filter((value) => value.batchId === batchId && (!participantId || value.participantId === participantId))
      .map((value) => structuredClone(value))
  }

  saveSubmission(submission: DemoSubmission): void {
    this.submissions.set(submission.id, structuredClone(submission))
    this.persist()
  }

  getSubmission(submissionId: string): DemoSubmission | null {
    const value = this.submissions.get(submissionId)
    return value ? structuredClone(value) : null
  }

  findSubmissionByIdempotencyKey(idempotencyKey: string): DemoSubmission | null {
    const value = [...this.submissions.values()].find((candidate) => candidate.idempotencyKey === idempotencyKey)
    return value ? structuredClone(value) : null
  }

  private persist(): void {
    if (!this.storage) return
    try {
      this.storage.setItem('capability-radar:demo-store', JSON.stringify({
        version: 1,
        idCounter: this.idCounter,
        people: [...this.people.values()],
        batches: [...this.batches.values()],
        participants: [...this.participants.values()],
        assignments: [...this.assignments.values()],
        submissions: [...this.submissions.values()],
      }))
    } catch {
      // 忽略浏览器禁用本地存储的场景。
    }
  }

  private load(storage: Storage): void {
    try {
      const raw = storage.getItem('capability-radar:demo-store')
      if (!raw) return
      const data = JSON.parse(raw) as {
        version?: number
        idCounter?: number
        people?: DemoPerson[]
        batches?: DemoBatch[]
        participants?: DemoParticipant[]
        assignments?: DemoAssignment[]
        submissions?: DemoSubmission[]
      }
      if (data.version !== 1) return
      this.idCounter = data.idCounter ?? 0
      for (const value of data.people ?? []) this.people.set(value.id, value)
      for (const value of data.batches ?? []) this.batches.set(value.id, value)
      for (const value of data.participants ?? []) this.participants.set(value.id, value)
      for (const value of data.assignments ?? []) this.assignments.set(value.id, value)
      for (const value of data.submissions ?? []) this.submissions.set(value.id, value)
    } catch {
      // 忽略损坏或不可读的本地演示数据。
    }
  }
}
