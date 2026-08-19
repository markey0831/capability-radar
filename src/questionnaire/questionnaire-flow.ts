import type { AnswerCode, QuestionBankRole } from '../../shared/question-bank/schema'
import { MINIMUM_VALID_ANSWERS_PER_DIMENSION } from '../../shared/scoring/questionnaire-score'

export function setAnswer(
  answers: Record<string, AnswerCode>,
  questionId: string,
  answer: AnswerCode,
): Record<string, AnswerCode> {
  return { ...answers, [questionId]: answer }
}

export function dimensionValidAnswerCount(
  role: QuestionBankRole,
  dimensionIndex: number,
  answers: Record<string, AnswerCode>,
): number {
  const dimension = role.dimensions[dimensionIndex]
  if (!dimension) return 0
  return dimension.questions.filter((question) => {
    const answer = answers[question.id]
    return answer && answer !== 'UNABLE'
  }).length
}

export function dimensionValidAnswerCounts(role: QuestionBankRole, answers: Record<string, AnswerCode>): number[] {
  return role.dimensions.map((_, index) => dimensionValidAnswerCount(role, index, answers))
}

export function hasSubmittableDimension(role: QuestionBankRole, answers: Record<string, AnswerCode>): boolean {
  return role.dimensions.some((dimension) => {
    const valid = dimension.questions.filter((question) => {
      const answer = answers[question.id]
      return answer && answer !== 'UNABLE'
    }).length
    return valid >= MINIMUM_VALID_ANSWERS_PER_DIMENSION
  })
}

export function answeredCount(answers: Record<string, AnswerCode>): number {
  return Object.keys(answers).filter((questionId) => answers[questionId]).length
}

export function buildSubmissionAnswers(role: QuestionBankRole, answers: Record<string, AnswerCode>): Record<string, AnswerCode> {
  const result: Record<string, AnswerCode> = {}
  for (const dimension of role.dimensions) {
    for (const question of dimension.questions) {
      result[question.id] = answers[question.id] ?? 'UNABLE'
    }
  }
  return result
}
