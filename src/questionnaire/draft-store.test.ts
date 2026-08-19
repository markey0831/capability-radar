import { describe, expect, it } from 'vitest'
import { DraftStore } from './draft-store'

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear() {
      map.clear()
    },
    getItem(key: string) {
      return map.get(key) ?? null
    },
    key(index: number) {
      return [...map.keys()][index] ?? null
    },
    removeItem(key: string) {
      map.delete(key)
    },
    setItem(key: string, value: string) {
      map.set(key, value)
    },
  } as Storage
}

describe('DraftStore', () => {
  it('saves, loads and clears a draft', () => {
    const store = new DraftStore(memoryStorage())
    const key = 'draft-key'
    expect(store.load(key)).toBeNull()
    store.save(key, { answers: { q1: 'A' }, dimensionIndex: 2, savedAt: '2026-08-14T00:00:00.000Z' })
    expect(store.load(key)).toEqual({
      answers: { q1: 'A' },
      dimensionIndex: 2,
      savedAt: '2026-08-14T00:00:00.000Z',
    })
    store.clear(key)
    expect(store.load(key)).toBeNull()
  })

  it('returns null for malformed stored data', () => {
    const storage = memoryStorage()
    storage.setItem('broken', '{not-json')
    const store = new DraftStore(storage)
    expect(store.load('broken')).toBeNull()
  })
})
