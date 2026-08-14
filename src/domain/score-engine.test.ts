import { describe, expect, it } from 'vitest'
import { getRoleModel } from '../config/role-models'
import type { AssessmentDraft, RaterInput } from './types'
import { calculateAssessment, classifyRater, normalizeWeights, validateScoreText } from './score-engine'

const role = getRoleModel('project-manager')

function rater(id: string, values: Array<number | string>, name = ''): RaterInput {
  return {
    id,
    name,
    scores: Object.fromEntries(role.dimensions.map((dimension, index) => [dimension.id, String(values[index] ?? '')])),
  }
}

function draft(overrides: Partial<AssessmentDraft['raters']> = {}): AssessmentDraft {
  return {
    person: { name: '张三', department: '数字业务部', roleId: role.id, assessmentDate: '2026-08-13' },
    raters: { superior: [], peer: [], subordinate: [], ...overrides },
  }
}

describe('评分校验', () => {
  it.each(['0', '100', '88', '88.5'])('接受合法分数 %s', (value) => expect(validateScoreText(value)).toBe(true))
  it.each(['-1', '100.1', '88.55', 'abc'])('拒绝非法分数 %s', (value) => expect(validateScoreText(value)).toBe(false))

  it('有姓名但六项全空仍视为空白评分人', () => {
    expect(classifyRater(rater('1', [], '李经理'), role.dimensions).status).toBe('blank')
  })

  it('部分填写时视为不完整评分人', () => {
    expect(classifyRater(rater('1', [80]), role.dimensions).status).toBe('incomplete')
  })
})

describe('权重归一化', () => {
  it('三个层级保持 50/30/20', () => expect(normalizeWeights(['superior', 'peer', 'subordinate'])).toEqual({ superior: 0.5, peer: 0.3, subordinate: 0.2 }))
  it('上级和平级变为 62.5/37.5', () => expect(normalizeWeights(['superior', 'peer'])).toEqual({ superior: 0.625, peer: 0.375 }))
  it('上级和下级按 5:2 归一化', () => expect(normalizeWeights(['superior', 'subordinate'])).toEqual({ superior: 5 / 7, subordinate: 2 / 7 }))
  it('平级和下级变为 60/40', () => expect(normalizeWeights(['peer', 'subordinate'])).toEqual({ peer: 0.6, subordinate: 0.4 }))
  it('只有一个层级时权重为 1', () => expect(normalizeWeights(['peer'])).toEqual({ peer: 1 }))
})

describe('评估计算', () => {
  it('先计算同级多人均分，再计算层级加权和五分制', () => {
    const result = calculateAssessment(draft({
      superior: [rater('s1', [80, 90, 100, 70, 80, 90]), rater('s2', [100, 80, 80, 90, 100, 70])],
      peer: [rater('p1', [60, 70, 80, 90, 100, 50])],
    }), role)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.result.effectiveWeights).toEqual({ superior: 0.625, peer: 0.375 })
    expect(result.result.levelAverages.superior?.[role.dimensions[0].id]).toBe(90)
    expect(result.result.dimensions[0].percentageScore).toBe(78.75)
    expect(result.result.dimensions[0].score).toBe(3.9375)
    expect(result.result.overallAverage).toBeCloseTo(result.result.dimensions.reduce((sum, item) => sum + item.score, 0) / 6)
  })

  it('不提前舍入中间结果', () => {
    const result = calculateAssessment(draft({ superior: [rater('s1', [83.3, 83.3, 83.3, 83.3, 83.3, 83.3])] }), role)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.result.dimensions[0].score).toBe(4.165)
  })

  it('无完整评分人时返回错误', () => {
    const result = calculateAssessment(draft({ superior: [rater('s1', [])] }), role)
    expect(result.ok).toBe(false)
  })

  it('不完整评分人会阻止生成', () => {
    const result = calculateAssessment(draft({ superior: [rater('s1', [80])] }), role)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.some((error) => error.path.includes('scores'))).toBe(true)
  })
})
