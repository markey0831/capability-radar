import type { HistoricalResultIdentity } from '../domain/types'

export function areHistoricalResultsComparable(
  current: HistoricalResultIdentity,
  previous: HistoricalResultIdentity,
): boolean {
  if (current.personId !== previous.personId || current.roleId !== previous.roleId) return false
  if (current.dimensionIds.length !== previous.dimensionIds.length) return false
  return current.dimensionIds.every((dimensionId, index) => dimensionId === previous.dimensionIds[index])
}
