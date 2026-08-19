import { QUESTION_BANK } from '../../../../shared/question-bank/load'
import { RATER_LEVELS } from '../../../../shared/domain/types'
import type { RaterLevel } from '../../../../shared/domain/types'
import { notFound } from '../http/errors'
import type { ResultsRepository } from '../repositories/contracts'
import type { ResultService } from '../services/result-service'
import type { AssessmentExportDataset, ExportLayerRow, ExportSubmissionRow } from './excel-workbook'

export interface ExportServiceDependencies {
  repository: ResultsRepository
  resultService: ResultService
}

function emptyLevels(): Record<RaterLevel, { percentageMean: number | null; validRaterCount: number }> {
  return {
    superior: { percentageMean: null, validRaterCount: 0 },
    peer: { percentageMean: null, validRaterCount: 0 },
    subordinate: { percentageMean: null, validRaterCount: 0 },
  }
}

export async function buildAssessmentExportDataset(
  batchId: string,
  dependencies: ExportServiceDependencies,
): Promise<AssessmentExportDataset> {
  const batch = await dependencies.repository.getBatch(batchId)
  if (!batch) throw notFound('批次不存在')
  const role = QUESTION_BANK.roles.find((candidate) => candidate.id === batch.roleId)
  if (!role) throw new Error(`题库中不存在职位：${batch.roleId}`)

  const dimensions = role.dimensions.map((dimension) => ({ id: dimension.id, name: dimension.name }))
  const participants = (await dependencies.repository.listParticipants(batchId)).filter((participant) => participant.status === 'active')
  const assignments = await dependencies.repository.listAssignments(batchId)
  const submissions = await dependencies.repository.listSubmissions(batchId)
  const participantMap = new Map(participants.map((participant) => [participant.id, participant]))
  const assignmentMap = new Map(assignments.map((assignment) => [assignment.id, assignment]))

  const summary = []
  const layered: ExportLayerRow[] = []
  for (const participant of participants) {
    const { current } = await dependencies.resultService.getParticipantResult(batchId, participant.id)
    summary.push({
      personName: participant.nameSnapshot,
      department: participant.departmentSnapshot,
      roleName: role.name,
      overallFivePointScore: current.overallFivePointScore,
      scores: Object.fromEntries(current.dimensions.map((dimension) => [dimension.dimensionId, dimension.fivePointScore])),
    })
    for (const dimension of current.dimensions) {
      const levels = emptyLevels()
      for (const level of RATER_LEVELS) {
        const value = dimension.levels[level]
        levels[level] = value
          ? { percentageMean: value.percentageMean, validRaterCount: value.validRaterCount }
          : { percentageMean: null, validRaterCount: 0 }
      }
      layered.push({
        personName: participant.nameSnapshot,
        dimensionId: dimension.dimensionId,
        dimensionName: dimension.name,
        levels,
      })
    }
  }

  const submissionRows: ExportSubmissionRow[] = submissions.map((submission) => {
    const assignment = assignmentMap.get(submission.assignmentId)
    const participant = participantMap.get(submission.participantId)
    return {
      evaluateeName: participant?.nameSnapshot ?? '',
      raterName: assignment?.raterNameSnapshot ?? '',
      raterDepartment: assignment?.raterDepartmentSnapshot ?? '',
      level: assignment?.level ?? 'peer',
      status: submission.status === 'active' ? '有效' : '作废',
      submittedAt: submission.submittedAt,
      voidReason: submission.voidReason ?? null,
      answers: submission.answers,
      dimensionScores: submission.dimensionScores,
    }
  })

  const nowIso = new Date().toISOString()
  const taskProgress = assignments.map((assignment) => {
    const participant = participantMap.get(assignment.participantId)
    const status = assignment.status === 'submitted'
      ? '已提交'
      : assignment.status === 'cancelled'
        ? '已取消'
        : batch.deadlineAt < nowIso
          ? '逾期未提交'
          : '待提交'
    return {
      evaluateeName: participant?.nameSnapshot ?? '',
      raterName: assignment.raterNameSnapshot,
      raterDepartment: assignment.raterDepartmentSnapshot,
      level: assignment.level,
      status,
      submittedAt: assignment.submittedAt,
    }
  })

  return {
    batch: { name: batch.name, roleName: role.name, assessmentDate: batch.assessmentDate },
    dimensions,
    summary,
    layered,
    submissions: submissionRows,
    taskProgress,
  }
}
