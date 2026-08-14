import { CAPABILITY_CATEGORIES, RATER_LEVELS } from './types'
import type {
  AssessmentDraft,
  AssessmentResult,
  CapabilityDimension,
  FieldError,
  RaterInput,
  RaterLevel,
  RoleModel,
} from './types'

const ORIGINAL_WEIGHTS: Record<RaterLevel, number> = {
  superior: 50,
  peer: 30,
  subordinate: 20,
}

export type RaterClassification =
  | { status: 'blank' }
  | { status: 'incomplete'; missingIds: string[]; invalidIds: string[] }
  | { status: 'complete'; values: Record<string, number> }

export function validateScoreText(value: string): boolean {
  if (!/^\d{1,3}(?:\.\d)?$/.test(value.trim())) return false
  const numeric = Number(value)
  return numeric >= 0 && numeric <= 100
}

export function classifyRater(rater: RaterInput, dimensions: readonly CapabilityDimension[]): RaterClassification {
  const texts = dimensions.map((dimension) => (rater.scores[dimension.id] ?? '').trim())
  if (texts.every((value) => value === '')) return { status: 'blank' }

  const missingIds = dimensions.filter((_, index) => texts[index] === '').map((dimension) => dimension.id)
  const invalidIds = dimensions
    .filter((_, index) => texts[index] !== '' && !validateScoreText(texts[index]))
    .map((dimension) => dimension.id)
  if (missingIds.length || invalidIds.length) return { status: 'incomplete', missingIds, invalidIds }

  return {
    status: 'complete',
    values: Object.fromEntries(dimensions.map((dimension, index) => [dimension.id, Number(texts[index])])),
  }
}

export function normalizeWeights(levels: RaterLevel[]): Partial<Record<RaterLevel, number>> {
  const uniqueLevels = [...new Set(levels)]
  const total = uniqueLevels.reduce((sum, level) => sum + ORIGINAL_WEIGHTS[level], 0)
  if (total === 0) return {}
  return Object.fromEntries(uniqueLevels.map((level) => [level, ORIGINAL_WEIGHTS[level] / total]))
}

export function calculateLevelAverages(
  raters: RaterInput[],
  dimensions: readonly CapabilityDimension[],
): { averages: Record<string, number> | null; errors: FieldError[]; completeCount: number } {
  const complete: Record<string, number>[] = []
  const errors: FieldError[] = []
  raters.forEach((rater, raterIndex) => {
    const classification = classifyRater(rater, dimensions)
    if (classification.status === 'complete') complete.push(classification.values)
    if (classification.status === 'incomplete') {
      for (const dimensionId of [...classification.missingIds, ...classification.invalidIds]) {
        errors.push({ path: `raters.${raterIndex}.scores.${dimensionId}`, message: '请填写0–100之间、最多一位小数的分数' })
      }
    }
  })

  if (!complete.length) return { averages: null, errors, completeCount: 0 }
  const averages = Object.fromEntries(dimensions.map((dimension) => [
    dimension.id,
    complete.reduce((sum, values) => sum + values[dimension.id], 0) / complete.length,
  ]))
  return { averages, errors, completeCount: complete.length }
}

export function calculateAssessment(
  draft: AssessmentDraft,
  role: RoleModel,
): { ok: true; result: AssessmentResult } | { ok: false; errors: FieldError[] } {
  const errors: FieldError[] = []
  if (!draft.person.name.trim()) errors.push({ path: 'person.name', message: '请填写姓名' })
  if (!draft.person.department.trim()) errors.push({ path: 'person.department', message: '请填写部门' })
  if (!draft.person.roleId) errors.push({ path: 'person.roleId', message: '请选择职位' })
  if (!draft.person.assessmentDate) errors.push({ path: 'person.assessmentDate', message: '请选择评估日期' })

  const levelAverages: AssessmentResult['levelAverages'] = {}
  const activeLevels: RaterLevel[] = []
  for (const level of RATER_LEVELS) {
    const calculated = calculateLevelAverages(draft.raters[level], role.dimensions)
    errors.push(...calculated.errors.map((error) => ({ ...error, path: `${level}.${error.path}` })))
    if (calculated.averages) {
      levelAverages[level] = calculated.averages
      activeLevels.push(level)
    }
  }
  if (!activeLevels.length) errors.push({ path: 'raters', message: '至少需要一位完整评分人' })
  if (errors.length) return { ok: false, errors }

  const effectiveWeights = normalizeWeights(activeLevels)
  const dimensions = role.dimensions.map((dimension) => {
    const percentageScore = activeLevels.reduce(
      (sum, level) => sum + (levelAverages[level]?.[dimension.id] ?? 0) * (effectiveWeights[level] ?? 0),
      0,
    )
    return {
      dimensionId: dimension.id,
      name: dimension.name,
      category: dimension.category,
      percentageScore,
      score: percentageScore / 20,
    }
  })
  const categoryScores = CAPABILITY_CATEGORIES.map((category) => {
    const members = dimensions.filter((dimension) => dimension.category === category)
    return { category, score: members.reduce((sum, dimension) => sum + dimension.score, 0) / members.length }
  })
  const overallAverage = dimensions.reduce((sum, dimension) => sum + dimension.score, 0) / dimensions.length

  return {
    ok: true,
    result: {
      person: {
        name: draft.person.name.trim(),
        department: draft.person.department.trim(),
        roleId: role.id,
        assessmentDate: draft.person.assessmentDate,
      },
      roleName: role.name,
      roleTitleEn: role.titleEn,
      dimensions,
      categoryScores,
      overallAverage,
      levelAverages,
      effectiveWeights,
    },
  }
}

export function formatScore(value: number): string {
  return value.toFixed(1)
}
