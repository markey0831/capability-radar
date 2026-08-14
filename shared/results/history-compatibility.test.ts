import { describe, expect, it } from 'vitest'
import { areHistoricalResultsComparable } from './history-compatibility'

const current = {
  personId: 'person-1',
  roleId: 'sales',
  dimensionIds: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'],
}

describe('history compatibility', () => {
  it('accepts the same person, role, and ordered dimensions', () => {
    expect(areHistoricalResultsComparable(current, { ...current })).toBe(true)
  })

  it('rejects another person, role, dimension version, or dimension order', () => {
    expect(areHistoricalResultsComparable(current, { ...current, personId: 'person-2' })).toBe(false)
    expect(areHistoricalResultsComparable(current, { ...current, roleId: 'business' })).toBe(false)
    expect(areHistoricalResultsComparable(current, { ...current, dimensionIds: ['d1', 'd2'] })).toBe(false)
    expect(areHistoricalResultsComparable(current, { ...current, dimensionIds: ['d2', 'd1', 'd3', 'd4', 'd5', 'd6'] })).toBe(false)
  })
})
