import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { buildAssessmentWorkbook } from './excel-workbook'
import type { AssessmentExportDataset } from './excel-workbook'

const dataset: AssessmentExportDataset = {
  batch: { name: '2026年第三季度评估', roleName: '销售', assessmentDate: '2026-08-13' },
  dimensions: [
    { id: 'd1', name: '业务能力' },
    { id: 'd2', name: '沟通协作' },
  ],
  summary: [
    {
      personName: '=张三',
      department: '销售部',
      roleName: '销售',
      overallFivePointScore: 3.5,
      scores: { d1: 3, d2: 4 },
    },
  ],
  layered: [
    {
      personName: '张三',
      dimensionId: 'd1',
      dimensionName: '业务能力',
      levels: {
        superior: { percentageMean: 60, validRaterCount: 1 },
        peer: { percentageMean: 80, validRaterCount: 2 },
        subordinate: { percentageMean: null, validRaterCount: 0 },
      },
    },
  ],
  submissions: [
    {
      evaluateeName: '张三',
      raterName: '李四',
      raterDepartment: '管理部',
      level: 'superior',
      status: '有效',
      submittedAt: '2026-08-13T08:00:00.000Z',
      voidReason: null,
      answers: { q1: 'A', q2: 'B' },
      dimensionScores: [
        { dimensionId: 'd1', validAnswerCount: 5, percentageScore: 80, fivePointScore: 4 },
      ],
    },
  ],
  taskProgress: [
    {
      evaluateeName: '张三',
      raterName: '李四',
      raterDepartment: '管理部',
      level: 'superior',
      status: '待提交',
      submittedAt: null,
    },
  ],
}

describe('buildAssessmentWorkbook', () => {
  it('creates the four required worksheets with expected structure', async () => {
    const buffer = await buildAssessmentWorkbook(dataset)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['汇总结果', '分层统计', '答卷明细', '任务进度'])

    const summary = workbook.getWorksheet('汇总结果')
    expect(summary.getCell('E1').value).toBe('业务能力')
    expect(summary.getCell('F1').value).toBe('沟通协作')
    expect(summary.getCell('A2').value).toBe("'=张三")
    expect(summary.getCell('D2').value).toBe(3.5)
    expect(summary.getCell('E2').value).toBe(3)
    expect(summary.getCell('F2').value).toBe(4)

    const layered = workbook.getWorksheet('分层统计')
    expect(layered.getCell('A1').value).toBe('人员')
    expect(layered.getCell('B2').value).toBe('业务能力')
    expect(layered.getCell('C2').value).toBe(60)
    expect(layered.getCell('E2').value).toBe(80)
    expect(layered.getCell('F2').value).toBe(2)

    const submissions = workbook.getWorksheet('答卷明细')
    expect(submissions.getCell('A1').value).toBe('被评估人')
    expect(submissions.getCell('B2').value).toBe('李四')
    expect(submissions.getCell('H2').value).toBe(4)
    expect(submissions.getCell('J2').value).toBe('A')
    expect(submissions.getCell('K2').value).toBe('B')

    const progress = workbook.getWorksheet('任务进度')
    expect(progress.getCell('A2').value).toBe('张三')
    expect(progress.getCell('B2').value).toBe('李四')
    expect(progress.getCell('E2').value).toBe('待提交')
  })
})
