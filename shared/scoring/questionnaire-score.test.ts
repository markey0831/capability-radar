import { describe, expect, it } from 'vitest'
import { QUESTION_BANK } from '../question-bank/load'
import type { AnswerCode } from '../question-bank/schema'
import type { QuestionnaireAnswers, QuestionnaireRaterResponse } from '../domain/types'
import {
  answerPercentageScore,
  calculateIndividualDimensionScores,
  calculateQuestionnaireAssessment,
} from './questionnaire-score'

const role = QUESTION_BANK.roles[0]!

function answersForDimension(dimensionIndex: number, values: AnswerCode[]): QuestionnaireAnswers {
  const dimension = role.dimensions[dimensionIndex]!
  return Object.fromEntries(dimension.questions.map((question, index) => [question.id, values[index] ?? 'UNABLE']))
}

function allAnswers(value: AnswerCode): QuestionnaireAnswers {
  return Object.fromEntries(
    role.dimensions.flatMap((dimension) => dimension.questions.map((question) => [question.id, value])),
  )
}

function rater(id: string, level: QuestionnaireRaterResponse['level'], answers: QuestionnaireAnswers): QuestionnaireRaterResponse {
  return { id, level, answers }
}

describe('questionnaire scoring', () => {
  it('maps A-E to 20-100 and treats UNABLE or missing as missing data', () => {
    expect(['A', 'B', 'C', 'D', 'E'].map((answer) => answerPercentageScore(answer as AnswerCode))).toEqual([
      20, 40, 60, 80, 100,
    ])
    expect(answerPercentageScore('UNABLE')).toBeNull()
    expect(answerPercentageScore(undefined)).toBeNull()
  })

  it.each([
    { values: ['UNABLE', 'UNABLE', 'UNABLE', 'UNABLE', 'UNABLE'] as AnswerCode[], valid: 0, score: null },
    { values: ['E', 'UNABLE', 'UNABLE', 'UNABLE', 'UNABLE'] as AnswerCode[], valid: 1, score: null },
    { values: ['E', 'D', 'UNABLE', 'UNABLE', 'UNABLE'] as AnswerCode[], valid: 2, score: null },
    { values: ['E', 'D', 'C', 'UNABLE', 'UNABLE'] as AnswerCode[], valid: 3, score: 80 },
    { values: ['E', 'D', 'C', 'B', 'UNABLE'] as AnswerCode[], valid: 4, score: 70 },
    { values: ['E', 'D', 'C', 'B', 'A'] as AnswerCode[], valid: 5, score: 60 },
  ])('requires at least three valid answers: $valid', ({ values, valid, score }) => {
    const result = calculateIndividualDimensionScores(role, answersForDimension(0, values))[0]
    expect(result?.validAnswerCount).toBe(valid)
    expect(result?.percentageScore).toBe(score)
  })

  it('allows one rater to be valid in one dimension and invalid in another', () => {
    const answers = {
      ...answersForDimension(0, ['E', 'D', 'C']),
      ...answersForDimension(1, ['E', 'D']),
    }
    const scores = calculateIndividualDimensionScores(role, answers)
    expect(scores[0]?.percentageScore).toBe(80)
    expect(scores[1]?.percentageScore).toBeNull()
  })

  it('averages people within a level before applying fixed level weights', () => {
    const result = calculateQuestionnaireAssessment(role, QUESTION_BANK.version, [
      rater('s1', 'superior', allAnswers('E')),
      rater('p1', 'peer', allAnswers('C')),
      rater('p2', 'peer', allAnswers('A')),
      rater('d1', 'subordinate', allAnswers('B')),
    ])
    // superior 100; peer mean 40; subordinate 40 => 100*.5 + 40*.3 + 40*.2 = 70
    expect(result.dimensions[0]?.percentageScore).toBe(70)
    expect(result.dimensions[0]?.levels.peer?.validRaterCount).toBe(2)
    expect(result.dimensions[0]?.levels.peer?.percentageMean).toBe(40)
  })

  it('renormalizes weights independently for each dimension', () => {
    const superior = allAnswers('D')
    const peer = {
      ...allAnswers('C'),
      ...answersForDimension(0, ['UNABLE', 'UNABLE', 'UNABLE', 'UNABLE', 'UNABLE']),
    }
    const result = calculateQuestionnaireAssessment(role, QUESTION_BANK.version, [
      rater('s1', 'superior', superior),
      rater('p1', 'peer', peer),
    ])
    expect(result.dimensions[0]?.percentageScore).toBe(80)
    expect(result.dimensions[0]?.validRaterCount).toBe(1)
    expect(result.dimensions[1]?.percentageScore).toBeCloseTo((80 * 0.5 + 60 * 0.3) / 0.8)
    expect(result.dimensions[1]?.validRaterCount).toBe(2)
  })

  it('uses a lone valid level as the dimension result', () => {
    const result = calculateQuestionnaireAssessment(role, QUESTION_BANK.version, [
      rater('p1', 'peer', allAnswers('B')),
    ])
    expect(result.dimensions.every((dimension) => dimension.percentageScore === 40)).toBe(true)
    expect(result.isComplete).toBe(true)
    expect(result.overallFivePointScore).toBe(2)
  })

  it('does not produce a radar-ready complete result or overall score with a missing dimension', () => {
    const partial = {
      ...allAnswers('D'),
      ...answersForDimension(5, ['UNABLE', 'UNABLE', 'UNABLE', 'UNABLE', 'UNABLE']),
    }
    const result = calculateQuestionnaireAssessment(role, QUESTION_BANK.version, [
      rater('s1', 'superior', partial),
    ])
    expect(result.dimensions.slice(0, 5).every((dimension) => dimension.fivePointScore === 4)).toBe(true)
    expect(result.dimensions[5]?.fivePointScore).toBeNull()
    expect(result.isComplete).toBe(false)
    expect(result.overallFivePointScore).toBeNull()
  })
})
