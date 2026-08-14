import { beforeEach, describe, expect, it } from 'vitest'
import { getRoleModel } from '../config/role-models'
import type { AssessmentResult, SavedAssessmentV1 } from '../domain/types'
import { checkDuplicate, createSavedAssessment, deleteRecord, findPreviousCompatibleRecord, loadHistory, saveRecord } from './history-store'

const role = getRoleModel('project-manager')

function result(date = '2026-08-13', department = '数字业务部'): AssessmentResult {
  return {
    person: { name: ' 张三 ', department, roleId: role.id, assessmentDate: date },
    roleName: role.name,
    roleTitleEn: role.titleEn,
    dimensions: role.dimensions.map((dimension, index) => ({ dimensionId: dimension.id, name: dimension.name, category: dimension.category, percentageScore: 80 + index, score: 4 + index / 20 })),
    categoryScores: [],
    overallAverage: 4.125,
    levelAverages: {},
    effectiveWeights: { superior: 1 },
  }
}

describe('历史记录', () => {
  beforeEach(() => localStorage.clear())

  it('只修剪姓名与部门首尾空格', () => {
    const record = createSavedAssessment(result(), 'id', '2026-08-13T00:00:00.000Z')
    expect(record.person.name).toBe('张三')
    expect(record.person.department).toBe('数字业务部')
  })

  it('检测同一人、部门、职位和日期的重复记录', () => {
    const a = createSavedAssessment(result(), 'a', '2026-08-13T00:00:00.000Z')
    const b = createSavedAssessment(result(), 'b', '2026-08-13T01:00:00.000Z')
    expect(checkDuplicate(b, [a])?.id).toBe('a')
  })

  it('选择严格早于本次且日期最近的兼容记录', () => {
    const records = [
      createSavedAssessment(result('2026-05-10'), 'old', '2026-05-10T00:00:00.000Z'),
      createSavedAssessment(result('2026-08-01'), 'recent', '2026-08-01T00:00:00.000Z'),
      createSavedAssessment(result('2026-08-13'), 'same', '2026-08-13T00:00:00.000Z'),
    ]
    expect(findPreviousCompatibleRecord(result(), records, role)?.id).toBe('recent')
  })

  it('同名不同部门不匹配', () => {
    const records = [createSavedAssessment(result('2026-08-01', '其他部门'), 'other', '2026-08-01T00:00:00.000Z')]
    expect(findPreviousCompatibleRecord(result(), records, role)).toBeNull()
  })

  it('同日多条时按保存时间排序但不作为上次', () => {
    const records = [
      createSavedAssessment(result('2026-08-01'), 'a', '2026-08-01T00:00:00.000Z'),
      createSavedAssessment(result('2026-08-01'), 'b', '2026-08-02T00:00:00.000Z'),
    ]
    expect(findPreviousCompatibleRecord(result('2026-08-13'), records, role)?.id).toBe('b')
    expect(findPreviousCompatibleRecord(result('2026-08-01'), records, role)).toBeNull()
  })

  it('保存、覆盖和删除记录', () => {
    const first = createSavedAssessment(result(), 'a', '2026-08-13T00:00:00.000Z')
    expect(saveRecord(localStorage, first, false).status).toBe('saved')
    const replacement = { ...first, id: 'b', savedAt: '2026-08-13T01:00:00.000Z' }
    expect(saveRecord(localStorage, replacement, false).status).toBe('duplicate')
    expect(saveRecord(localStorage, replacement, true).status).toBe('saved')
    expect(loadHistory(localStorage).records.map((item) => item.id)).toEqual(['b'])
    deleteRecord(localStorage, 'b')
    expect(loadHistory(localStorage).records).toHaveLength(0)
  })

  it('损坏 JSON 返回可处理错误', () => {
    localStorage.setItem('capability-radar:assessments', '{broken')
    expect(loadHistory(localStorage).status).toBe('corrupt')
  })

  it('维度 id 不一致时不允许叠加', () => {
    const record = createSavedAssessment(result('2026-08-01'), 'a', '2026-08-01T00:00:00.000Z') as SavedAssessmentV1
    record.dimensions[0].dimensionId = 'legacy'
    expect(findPreviousCompatibleRecord(result(), [record], role)).toBeNull()
  })
})
