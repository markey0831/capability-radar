import { describe, expect, it } from 'vitest'
import { decodeCsvBytes, parseCsv, parsePersonImportCsv } from './csv-import'

describe('parseCsv', () => {
  it('parses quoted and unquoted fields', () => {
    expect(parseCsv('姓名,部门\n"张,三",销售部')).toEqual([
      ['姓名', '部门'],
      ['张,三', '销售部'],
    ])
  })
})

describe('parsePersonImportCsv', () => {
  it('maps header columns into person import rows', () => {
    const rows = parsePersonImportCsv('姓名,部门,职位ID,可被评,可评分\n张三,销售部,sales,是,否\n李四,管理部,,否,是')
    expect(rows).toEqual([
      { name: '张三', department: '销售部', currentRoleId: 'sales', canBeEvaluatee: true, canBeRater: false },
      { name: '李四', department: '管理部', currentRoleId: null, canBeEvaluatee: false, canBeRater: true },
    ])
  })

  it('strips a UTF-8 BOM from decoded text', () => {
    const bytes = new TextEncoder().encode('\uFEFF姓名,部门\n张三,销售部')
    expect(decodeCsvBytes(bytes.buffer)).toBe('姓名,部门\n张三,销售部')
  })
})
