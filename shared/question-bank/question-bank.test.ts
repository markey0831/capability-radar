import { describe, expect, it } from 'vitest'
import { ROLE_MODELS } from '../../src/config/role-models'
import { QUESTION_BANK, validateQuestionBank } from './load'

describe('versioned question bank', () => {
  it('contains exactly 7 roles, 42 dimensions, and 210 questions', () => {
    expect(QUESTION_BANK.roles).toHaveLength(7)
    expect(QUESTION_BANK.roles.flatMap((role) => role.dimensions)).toHaveLength(42)
    expect(
      QUESTION_BANK.roles.flatMap((role) => role.dimensions.flatMap((dimension) => dimension.questions)),
    ).toHaveLength(210)
  })

  it('has unique stable IDs and five non-empty behavioral options per question', () => {
    const ids = QUESTION_BANK.roles.flatMap((role) => [
      role.id,
      ...role.dimensions.flatMap((dimension) => [
        dimension.id,
        ...dimension.questions.map((question) => question.id),
      ]),
    ])
    expect(new Set(ids).size).toBe(ids.length)
    for (const role of QUESTION_BANK.roles) {
      for (const dimension of role.dimensions) {
        for (const question of dimension.questions) {
          expect(Object.keys(question.options)).toEqual(['A', 'B', 'C', 'D', 'E'])
          expect(Object.values(question.options).every((option) => option.trim().length > 0)).toBe(true)
        }
      }
    }
  })

  it('matches the current radar role and dimension models', () => {
    expect(QUESTION_BANK.roles.map((role) => role.id)).toEqual(ROLE_MODELS.map((role) => role.id))
    for (const role of ROLE_MODELS) {
      const bankRole = QUESTION_BANK.roles.find((candidate) => candidate.id === role.id)
      expect(bankRole?.name).toBe(role.name)
      expect(bankRole?.dimensions.map((dimension) => dimension.id)).toEqual(role.dimensions.map((dimension) => dimension.id))
      expect(bankRole?.dimensions.map((dimension) => dimension.name)).toEqual(role.dimensions.map((dimension) => dimension.name))
    }
  })

  it('rejects a malformed bank', () => {
    expect(() => validateQuestionBank({ schemaVersion: 1, version: 'x', checksum: 'bad', roles: [] })).toThrow(
      '题库格式错误',
    )
  })
})
