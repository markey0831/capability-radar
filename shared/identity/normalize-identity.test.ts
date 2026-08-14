import { describe, expect, it } from 'vitest'
import { normalizeIdentityText, normalizeRaterIdentity } from './normalize-identity'

describe('identity normalization', () => {
  it('trims, converts full-width spaces, and collapses repeated whitespace', () => {
    expect(normalizeIdentityText('　张  三\t ')).toBe('张 三')
    expect(normalizeIdentityText('  产品中心　 XR组  ')).toBe('产品中心 XR组')
  })

  it('keeps display text separate from matching text', () => {
    expect(normalizeRaterIdentity('  张  三  ', '  产品中心　XR组  ')).toEqual({
      displayName: '张  三',
      displayDepartment: '产品中心　XR组',
      normalizedName: '张 三',
      normalizedDepartment: '产品中心 XR组',
    })
  })
})
