import type { AnswerCode } from '../question-bank/schema'
import { RATER_LEVELS, RATER_LEVEL_WEIGHTS } from '../domain/types'
import type {
  AggregatedDimensionScore,
  IndividualDimensionScore,
  QuestionnaireAnswers,
  QuestionnaireAssessmentResult,
  QuestionnaireRaterResponse,
  RaterLevel,
  ScorableRole,
} from '../domain/types'

export const ANSWER_PERCENTAGE_SCORES: Readonly<Record<Exclude<AnswerCode, 'UNABLE'>, number>> = {
  A: 20,
  B: 40,
  C: 60,
  D: 80,
  E: 100,
}

export const MINIMUM_VALID_ANSWERS_PER_DIMENSION = 3

export function answerPercentageScore(answer: AnswerCode | undefined): number | null {
  if (!answer || answer === 'UNABLE') return null
  return ANSWER_PERCENTAGE_SCORES[answer]
}

export function calculateIndividualDimensionScores(
  role: ScorableRole,
  answers: QuestionnaireAnswers,
): IndividualDimensionScore[] {
  return role.dimensions.map((dimension) => {
    const values = dimension.questions
      .map((question) => answerPercentageScore(answers[question.id]))
      .filter((value): value is number => value !== null)
    const percentageScore = values.length >= MINIMUM_VALID_ANSWERS_PER_DIMENSION
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null
    return {
      dimensionId: dimension.id,
      validAnswerCount: values.length,
      percentageScore,
      fivePointScore: percentageScore === null ? null : percentageScore / 20,
    }
  })
}

function createLevelGroups(): Record<RaterLevel, number[]> {
  return { superior: [], peer: [], subordinate: [] }
}

function aggregateDimension(
  role: ScorableRole,
  dimensionIndex: number,
  raterScores: Array<{ level: RaterLevel; scores: IndividualDimensionScore[] }>,
): AggregatedDimensionScore {
  const dimension = role.dimensions[dimensionIndex]
  if (!dimension) throw new Error(`未知维度序号：${dimensionIndex}`)
  const grouped = createLevelGroups()
  for (const rater of raterScores) {
    const value = rater.scores[dimensionIndex]?.percentageScore
    if (value !== null && value !== undefined) grouped[rater.level].push(value)
  }

  const levels: AggregatedDimensionScore['levels'] = {}
  for (const level of RATER_LEVELS) {
    const values = grouped[level]
    if (values.length === 0) continue
    levels[level] = {
      level,
      validRaterCount: values.length,
      percentageMean: values.reduce((sum, value) => sum + value, 0) / values.length,
    }
  }

  const validLevels = RATER_LEVELS.filter((level) => levels[level] !== undefined)
  const totalWeight = validLevels.reduce((sum, level) => sum + RATER_LEVEL_WEIGHTS[level], 0)
  const percentageScore = validLevels.length === 0
    ? null
    : validLevels.reduce(
        (sum, level) => sum + (levels[level]?.percentageMean ?? 0) * RATER_LEVEL_WEIGHTS[level],
        0,
      ) / totalWeight

  return {
    dimensionId: dimension.id,
    name: dimension.name,
    percentageScore,
    fivePointScore: percentageScore === null ? null : percentageScore / 20,
    validRaterCount: validLevels.reduce((sum, level) => sum + (levels[level]?.validRaterCount ?? 0), 0),
    levels,
  }
}

export function calculateQuestionnaireAssessment(
  role: ScorableRole,
  questionnaireVersion: string,
  raters: readonly QuestionnaireRaterResponse[],
): QuestionnaireAssessmentResult {
  const raterScores = raters.map((rater) => ({
    level: rater.level,
    scores: calculateIndividualDimensionScores(role, rater.answers),
  }))
  const dimensions = role.dimensions.map((_, index) => aggregateDimension(role, index, raterScores))
  const isComplete = dimensions.every((dimension) => dimension.fivePointScore !== null)
  const overallFivePointScore = isComplete
    ? dimensions.reduce((sum, dimension) => sum + (dimension.fivePointScore ?? 0), 0) / dimensions.length
    : null

  return {
    roleId: role.id,
    questionnaireVersion,
    dimensions,
    isComplete,
    overallFivePointScore,
    submittedRaterCounts: {
      superior: raters.filter((rater) => rater.level === 'superior').length,
      peer: raters.filter((rater) => rater.level === 'peer').length,
      subordinate: raters.filter((rater) => rater.level === 'subordinate').length,
    },
  }
}
