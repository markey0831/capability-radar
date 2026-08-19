import ExcelJS from 'exceljs'
import type { AnswerCode } from '../../../../shared/question-bank/schema'
import type { IndividualDimensionScore, RaterLevel } from '../../../../shared/domain/types'

export interface ExportDimension {
  id: string
  name: string
}

export interface ExportSummaryRow {
  personName: string
  department: string
  roleName: string
  overallFivePointScore: number | null
  scores: Record<string, number | null>
}

export interface ExportLayerRow {
  personName: string
  dimensionId: string
  dimensionName: string
  levels: Record<RaterLevel, { percentageMean: number | null; validRaterCount: number }>
}

export interface ExportSubmissionRow {
  evaluateeName: string
  raterName: string
  raterDepartment: string
  level: RaterLevel
  status: string
  submittedAt: string
  voidReason: string | null
  answers: Record<string, AnswerCode>
  dimensionScores: IndividualDimensionScore[]
}

export interface ExportTaskProgressRow {
  evaluateeName: string
  raterName: string
  raterDepartment: string
  level: RaterLevel
  status: string
  submittedAt: string | null
}

export interface AssessmentExportDataset {
  batch: { name: string; roleName: string; assessmentDate: string }
  dimensions: ExportDimension[]
  summary: ExportSummaryRow[]
  layered: ExportLayerRow[]
  submissions: ExportSubmissionRow[]
  taskProgress: ExportTaskProgressRow[]
}

function safeText(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value
}

function fivePointValue(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : value
}

function levelName(level: RaterLevel): string {
  return { superior: '上级', peer: '平级', subordinate: '下级' }[level]
}

function formatShanghai(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

export async function buildAssessmentWorkbook(dataset: AssessmentExportDataset): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'capability-radar'
  workbook.created = new Date()

  const summary = workbook.addWorksheet('汇总结果')
  summary.columns = [
    { header: '姓名', key: 'personName', width: 16 },
    { header: '部门', key: 'department', width: 20 },
    { header: '职位', key: 'roleName', width: 16 },
    { header: '综合分', key: 'overall', width: 12 },
    ...dataset.dimensions.map((dimension) => ({ header: dimension.name, key: dimension.id, width: 14 })),
  ]
  for (const row of dataset.summary) {
    summary.addRow({
      personName: safeText(row.personName),
      department: safeText(row.department),
      roleName: safeText(row.roleName),
      overall: fivePointValue(row.overallFivePointScore),
      ...Object.fromEntries(dataset.dimensions.map((dimension) => [dimension.id, fivePointValue(row.scores[dimension.id])])),
    })
  }

  const layered = workbook.addWorksheet('分层统计')
  layered.columns = [
    { header: '人员', key: 'personName', width: 16 },
    { header: '维度', key: 'dimension', width: 18 },
    { header: '上级均分', key: 'superiorMean', width: 12 },
    { header: '上级人数', key: 'superiorCount', width: 10 },
    { header: '平级均分', key: 'peerMean', width: 12 },
    { header: '平级人数', key: 'peerCount', width: 10 },
    { header: '下级均分', key: 'subordinateMean', width: 12 },
    { header: '下级人数', key: 'subordinateCount', width: 10 },
  ]
  for (const row of dataset.layered) {
    layered.addRow({
      personName: safeText(row.personName),
      dimension: safeText(row.dimensionName),
      superiorMean: fivePointValue(row.levels.superior.percentageMean),
      superiorCount: row.levels.superior.validRaterCount,
      peerMean: fivePointValue(row.levels.peer.percentageMean),
      peerCount: row.levels.peer.validRaterCount,
      subordinateMean: fivePointValue(row.levels.subordinate.percentageMean),
      subordinateCount: row.levels.subordinate.validRaterCount,
    })
  }

  const submissions = workbook.addWorksheet('答卷明细')
  const answerIds = Array.from(new Set(dataset.submissions.flatMap((row) => Object.keys(row.answers)))).sort()
  submissions.columns = [
    { header: '被评估人', key: 'evaluatee', width: 14 },
    { header: '评分人', key: 'raterName', width: 14 },
    { header: '部门', key: 'department', width: 18 },
    { header: '层级', key: 'level', width: 10 },
    { header: '状态', key: 'status', width: 10 },
    { header: '提交时间', key: 'submittedAt', width: 22 },
    { header: '作废原因', key: 'voidReason', width: 24 },
    ...dataset.dimensions.map((dimension) => ({ header: `${dimension.name}分`, key: `score:${dimension.id}`, width: 12 })),
    ...answerIds.map((id) => ({ header: id, key: `answer:${id}`, width: 10 })),
  ]
  for (const row of dataset.submissions) {
    const values: Record<string, string | number | null> = {
      evaluatee: safeText(row.evaluateeName),
      raterName: safeText(row.raterName),
      department: safeText(row.raterDepartment),
      level: levelName(row.level),
      status: safeText(row.status),
      submittedAt: safeText(formatShanghai(row.submittedAt)),
      voidReason: row.voidReason ? safeText(row.voidReason) : null,
    }
    for (const dimension of dataset.dimensions) {
      const score = row.dimensionScores.find((candidate) => candidate.dimensionId === dimension.id)
      values[`score:${dimension.id}`] = score ? fivePointValue(score.fivePointScore) : null
    }
    for (const id of answerIds) {
      values[`answer:${id}`] = row.answers[id] ?? null
    }
    submissions.addRow(values)
  }

  const progress = workbook.addWorksheet('任务进度')
  progress.columns = [
    { header: '被评估人', key: 'evaluatee', width: 14 },
    { header: '评分人', key: 'raterName', width: 14 },
    { header: '部门', key: 'department', width: 18 },
    { header: '层级', key: 'level', width: 10 },
    { header: '状态', key: 'status', width: 12 },
    { header: '提交时间', key: 'submittedAt', width: 22 },
  ]
  for (const row of dataset.taskProgress) {
    progress.addRow({
      evaluatee: safeText(row.evaluateeName),
      raterName: safeText(row.raterName),
      department: safeText(row.raterDepartment),
      level: levelName(row.level),
      status: safeText(row.status),
      submittedAt: row.submittedAt ? safeText(formatShanghai(row.submittedAt)) : null,
    })
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
