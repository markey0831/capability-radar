import { describe, expect, it } from 'vitest'
import { matchRoute, Router } from './router'

const routes = [
  { path: '/q/:roleCode', value: 'questionnaire' },
  { path: '/admin/*', value: 'admin' },
  { path: '/admin', value: 'admin' },
  { path: '/', value: 'standalone' },
]

describe('matchRoute', () => {
  it('matches parameterized routes', () => {
    expect(matchRoute('/q/sales', routes)).toMatchObject({
      value: 'questionnaire',
      params: { roleCode: 'sales' },
    })
  })

  it('matches an admin prefix route and captures the rest', () => {
    expect(matchRoute('/admin/people', routes)).toMatchObject({
      value: 'admin',
      params: { rest: 'people' },
    })
  })

  it('matches the root route exactly', () => {
    expect(matchRoute('/', routes)).toMatchObject({
      value: 'standalone',
      params: {},
    })
  })

  it('returns null for unknown paths', () => {
    expect(matchRoute('/unknown', routes)).toBeNull()
  })
})

describe('Router', () => {
  it('emits the current match on start and after navigation', () => {
    const router = new Router(routes)
    const seen: Array<string | null> = []
    const stop = router.start((match) => {
      seen.push(match?.value ?? null)
    })
    expect(seen).toEqual(['standalone'])
    router.navigate('/q/sales')
    expect(seen).toEqual(['standalone', 'questionnaire'])
    stop()
  })
})
