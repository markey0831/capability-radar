import { describe, expect, it } from 'vitest'
import { QUESTION_BANK } from '../../shared/question-bank/load'
import {
  answeredCount,
  buildSubmissionAnswers,
  dimensionValidAnswerCounts,
  hasSubmittableDimension,
  setAnswer,
} from './questionnaire-flow'

const role = QUESTION_BANK.roles[0]

function firstQuestionIds(count: number): string[] {
  return role.dimensions[0].questions.slice(0, count).map((question) => question.id)
}

describe('questionnaire flow helpers', () => {
  it('sets answers immutably', () => {
    const before = {}
    const after = setAnswer(before, firstQuestionIds(1)[0], 'A')
    expect(before).toEqual({})
    expect(after).toEqual({ [firstQuestionIds(1)[0]]: 'A' })
  })

  it('counts only A—E answers as valid', () => {
    const ids = firstQuestionIds(4)
    const answers = {
      [ids[0]]: 'A' as const,
      [ids[1]]: 'E' as const,
      [ids[2]]: 'UNABLE' as const,
      [ids[3]]: 'B' as const,
    }
    expect(dimensionValidAnswerCounts(role, answers)[0]).toBe(3)
  })

  it('reports whether any dimension is submittable', () => {
    const ids = firstQuestionIds(3)
    expect(hasSubmittableDimension(role, { [ids[0]]: 'A', [ids[1]]: 'B', [ids[2]]: 'C' })).toBe(true)
    expect(hasSubmittableDimension(role, {})).toBe(false)
  })

  it('fills all 30 questions with UNABLE when building the submission payload', () => {
    const answers: Record<string, 'E'> = { [firstQuestionIds(1)[0]]: 'E' }
    const payload = buildSubmissionAnswers(role, answers)
    expect(Object.keys(payload)).toHaveLength(30)
    expect(payload[firstQuestionIds(1)[0]]).toBe('E')
    expect(Object.values(payload).filter((value) => value === 'UNABLE')).toHaveLength(29)
    expect(answeredCount(answers)).toBe(1)
  })
})
