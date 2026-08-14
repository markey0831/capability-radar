import type { AssessmentResult, RoleModel, SavedAssessmentV1 } from '../domain/types'

export const STORAGE_KEY = 'capability-radar:assessments'
export const SCHEMA_VERSION = 1

function normalizeText(value: string): string {
  return value.trim()
}

function personKey(record: Pick<SavedAssessmentV1, 'person'>): string {
  return [normalizeText(record.person.name), normalizeText(record.person.department), record.person.roleId].join('\u0000')
}

function duplicateKey(record: SavedAssessmentV1): string {
  return `${personKey(record)}\u0000${record.assessmentDate}`
}

export function createSavedAssessment(
  result: AssessmentResult,
  id: string = crypto.randomUUID(),
  savedAt = new Date().toISOString(),
): SavedAssessmentV1 {
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    person: {
      name: normalizeText(result.person.name),
      department: normalizeText(result.person.department),
      roleId: result.person.roleId,
      roleName: result.roleName,
    },
    assessmentDate: result.person.assessmentDate,
    dimensions: result.dimensions.map(({ dimensionId, name, category, score }) => ({ dimensionId, name, category, score })),
    categoryScores: result.categoryScores.map((item) => ({ ...item })),
    overallAverage: result.overallAverage,
    savedAt,
  }
}

function isSavedAssessment(value: unknown): value is SavedAssessmentV1 {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<SavedAssessmentV1>
  return item.schemaVersion === 1
    && typeof item.id === 'string'
    && typeof item.assessmentDate === 'string'
    && typeof item.savedAt === 'string'
    && Array.isArray(item.dimensions)
    && !!item.person
    && typeof item.person.name === 'string'
    && typeof item.person.department === 'string'
    && typeof item.person.roleId === 'string'
}

export function loadHistory(storage: Storage):
  | { status: 'ok'; records: SavedAssessmentV1[] }
  | { status: 'corrupt'; records: SavedAssessmentV1[]; error: Error } {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return { status: 'ok', records: [] }
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new Error('历史记录不是数组')
    return { status: 'ok', records: parsed.filter(isSavedAssessment) }
  } catch (error) {
    return { status: 'corrupt', records: [], error: error instanceof Error ? error : new Error(String(error)) }
  }
}

export function checkDuplicate(record: SavedAssessmentV1, history: SavedAssessmentV1[]): SavedAssessmentV1 | null {
  const key = duplicateKey(record)
  return history.find((item) => duplicateKey(item) === key) ?? null
}

export function saveRecord(storage: Storage, record: SavedAssessmentV1, overwrite: boolean):
  | { status: 'saved'; records: SavedAssessmentV1[] }
  | { status: 'duplicate'; existing: SavedAssessmentV1 }
  | { status: 'unavailable'; error: Error } {
  try {
    const loaded = loadHistory(storage)
    if (loaded.status === 'corrupt') return { status: 'unavailable', error: loaded.error }
    const duplicate = checkDuplicate(record, loaded.records)
    if (duplicate && !overwrite) return { status: 'duplicate', existing: duplicate }
    const records = duplicate
      ? loaded.records.map((item) => item.id === duplicate.id ? record : item)
      : [...loaded.records, record]
    storage.setItem(STORAGE_KEY, JSON.stringify(records))
    return { status: 'saved', records }
  } catch (error) {
    return { status: 'unavailable', error: error instanceof Error ? error : new Error(String(error)) }
  }
}

export function deleteRecord(storage: Storage, id: string): { status: 'deleted' } | { status: 'unavailable'; error: Error } {
  try {
    const loaded = loadHistory(storage)
    if (loaded.status === 'corrupt') return { status: 'unavailable', error: loaded.error }
    storage.setItem(STORAGE_KEY, JSON.stringify(loaded.records.filter((item) => item.id !== id)))
    return { status: 'deleted' }
  } catch (error) {
    return { status: 'unavailable', error: error instanceof Error ? error : new Error(String(error)) }
  }
}

export function isCompatible(record: SavedAssessmentV1, role: RoleModel): boolean {
  return record.dimensions.length === role.dimensions.length
    && record.dimensions.every((dimension, index) => dimension.dimensionId === role.dimensions[index].id)
}

export function findPreviousCompatibleRecord(
  current: AssessmentResult,
  history: SavedAssessmentV1[],
  role: RoleModel,
): SavedAssessmentV1 | null {
  const currentPerson = personKey({
    person: {
      name: current.person.name,
      department: current.person.department,
      roleId: current.person.roleId,
      roleName: current.roleName,
    },
  })
  return history
    .filter((record) => personKey(record) === currentPerson)
    .filter((record) => record.assessmentDate < current.person.assessmentDate)
    .filter((record) => isCompatible(record, role))
    .sort((a, b) => b.assessmentDate.localeCompare(a.assessmentDate) || b.savedAt.localeCompare(a.savedAt))[0] ?? null
}

export function sortHistory(records: SavedAssessmentV1[]): SavedAssessmentV1[] {
  return [...records].sort((a, b) => b.assessmentDate.localeCompare(a.assessmentDate) || b.savedAt.localeCompare(a.savedAt))
}
