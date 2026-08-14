import { randomUUID } from 'node:crypto'
import { QUESTION_BANK } from '../../../../shared/question-bank/load'
import { RATER_LEVELS, RATER_LEVEL_WEIGHTS } from '../../../../shared/domain/types'
import type { RaterLevel } from '../../../../shared/domain/types'
import type { ResultSnapshotRecord, ResultsRepository } from '../repositories/contracts'
import { ApiError, badRequest, notFound } from '../http/errors'

export class ResultService {
  constructor(
    private readonly repository: ResultsRepository,
    private readonly now: () => Date,
    private readonly createId: () => string = randomUUID,
  ) {}

  listSubmissions(batchId: string, participantId?: string) {
    return this.repository.listSubmissions(batchId, participantId)
  }

  async calculateParticipant(batchId: string, participantId: string) {
    const batch = await this.repository.getBatch(batchId)
    if (!batch) throw notFound('批次不存在')
    const role = QUESTION_BANK.roles.find((candidate) => candidate.id === batch.roleId)
    if (!role) throw new Error(`题库中不存在职位：${batch.roleId}`)
    const participant = (await this.repository.listParticipants(batchId)).find((candidate) => candidate.id === participantId)
    if (!participant || participant.status !== 'active') throw notFound('被评人不在该批次')
    const assignments = await this.repository.listAssignments(batchId)
    const assignmentMap = new Map(assignments.map((assignment) => [assignment.id, assignment]))
    const submissions = (await this.repository.listSubmissions(batchId, participantId)).filter((submission) => submission.status === 'active')

    const dimensions = role.dimensions.map((dimension) => {
      const grouped: Record<RaterLevel, number[]> = { superior: [], peer: [], subordinate: [] }
      for (const submission of submissions) {
        const assignment = assignmentMap.get(submission.assignmentId)
        const score = submission.dimensionScores.find((candidate) => candidate.dimensionId === dimension.id)?.percentageScore
        if (assignment && score !== null && score !== undefined) grouped[assignment.level].push(score)
      }
      const levels: Record<string, { validRaterCount: number; percentageMean: number }> = {}
      for (const level of RATER_LEVELS) {
        const values = grouped[level]
        if (values.length) levels[level] = { validRaterCount: values.length, percentageMean: values.reduce((sum, value) => sum + value, 0) / values.length }
      }
      const validLevels = RATER_LEVELS.filter((level) => levels[level])
      const weight = validLevels.reduce((sum, level) => sum + RATER_LEVEL_WEIGHTS[level], 0)
      const percentageScore = validLevels.length
        ? validLevels.reduce((sum, level) => sum + levels[level]!.percentageMean * RATER_LEVEL_WEIGHTS[level], 0) / weight
        : null
      return {
        dimensionId: dimension.id,
        name: dimension.name,
        percentageScore,
        fivePointScore: percentageScore === null ? null : percentageScore / 20,
        validRaterCount: validLevels.reduce((sum, level) => sum + levels[level]!.validRaterCount, 0),
        levels,
      }
    })
    const isComplete = dimensions.every((dimension) => dimension.fivePointScore !== null)
    return {
      batchId,
      participantId,
      roleId: role.id,
      dimensions,
      isComplete,
      overallFivePointScore: isComplete
        ? dimensions.reduce((sum, dimension) => sum + (dimension.fivePointScore ?? 0), 0) / dimensions.length
        : null,
      submittedRaterCounts: {
        superior: submissions.filter((submission) => assignmentMap.get(submission.assignmentId)?.level === 'superior').length,
        peer: submissions.filter((submission) => assignmentMap.get(submission.assignmentId)?.level === 'peer').length,
        subordinate: submissions.filter((submission) => assignmentMap.get(submission.assignmentId)?.level === 'subordinate').length,
      },
      sourceSubmissionIds: submissions.map((submission) => submission.id),
    }
  }

  async getParticipantResult(batchId: string, participantId: string) {
    const batch = await this.repository.getBatch(batchId)
    if (!batch) throw notFound('批次不存在')
    const participant = (await this.repository.listParticipants(batchId)).find((item) => item.id === participantId && item.status === 'active')
    if (!participant) throw notFound('被评人不在该批次')
    const activeSnapshots = (await this.repository.listResultSnapshots(batchId, participantId))
      .filter((snapshot) => snapshot.status === 'active')
      .sort((left, right) => right.snapshotVersion - left.snapshotVersion)
    const current = batch.status === 'closed' && activeSnapshots[0]
      ? activeSnapshots[0]
      : await this.calculateParticipant(batchId, participantId)

    const expectedDimensionIds = new Set(current.dimensions.map((dimension) => dimension.dimensionId))
    const previousBatches = (await this.repository.listBatches())
      .filter((candidate) =>
        candidate.id !== batch.id
        && candidate.roleId === batch.roleId
        && candidate.status === 'closed'
        && candidate.assessmentDate < batch.assessmentDate,
      )
      .sort((left, right) => right.assessmentDate.localeCompare(left.assessmentDate))
    let previous: { batch: typeof batch; snapshot: ResultSnapshotRecord } | null = null
    for (const candidate of previousBatches) {
      const priorParticipant = (await this.repository.listParticipants(candidate.id))
        .find((item) => item.personId === participant.personId && item.status === 'active')
      if (!priorParticipant) continue
      const snapshot = (await this.repository.listResultSnapshots(candidate.id, priorParticipant.id))
        .filter((item) => item.status === 'active')
        .sort((left, right) => right.snapshotVersion - left.snapshotVersion)[0]
      if (!snapshot) continue
      const actualIds = new Set(snapshot.dimensions.map((dimension) => dimension.dimensionId))
      if (actualIds.size !== expectedDimensionIds.size || [...expectedDimensionIds].some((id) => !actualIds.has(id))) continue
      previous = { batch: candidate, snapshot }
      break
    }
    return { batch, participant, current, previous }
  }

  async closeBatch(batchId: string) {
    const batch = await this.repository.getBatch(batchId)
    if (!batch) throw notFound('批次不存在')
    if (batch.status !== 'open') throw new ApiError(409, 'BATCH_NOT_OPEN', '只有开放批次可以关闭')
    const participants = (await this.repository.listParticipants(batchId)).filter((participant) => participant.status === 'active')
    const existing = await this.repository.listResultSnapshots(batchId)
    const snapshots: ResultSnapshotRecord[] = []
    for (const participant of participants) {
      const result = await this.calculateParticipant(batchId, participant.id)
      const nextVersion = Math.max(0, ...existing.filter((item) => item.participantId === participant.id).map((item) => item.snapshotVersion)) + 1
      snapshots.push({
        id: this.createId(), batchId, participantId: participant.id, snapshotVersion: nextVersion, status: 'active',
        dimensions: result.dimensions, isComplete: result.isComplete, overallFivePointScore: result.overallFivePointScore,
        submittedRaterCounts: result.submittedRaterCounts, sourceSubmissionIds: result.sourceSubmissionIds, createdAt: this.now().toISOString(),
      })
    }
    const status = await this.repository.closeBatchAtomic(batchId, snapshots, this.now().toISOString())
    if (status !== 'closed') throw new ApiError(409, 'BATCH_CLOSE_FAILED', '批次状态已经变化，请刷新后重试')
    return snapshots
  }

  async reopenBatch(batchId: string) {
    const status = await this.repository.reopenBatchAtomic(batchId, this.now().toISOString())
    if (status === 'not-found') throw notFound('批次不存在')
    if (status === 'role-already-open') throw new ApiError(409, 'ROLE_BATCH_ALREADY_OPEN', '该职位已经有其他开放批次')
    if (status !== 'reopened') throw new ApiError(409, 'BATCH_REOPEN_FAILED', '批次当前不能重新开放')
    return { id: batchId, status: 'open' as const }
  }

  async voidSubmission(submissionId: string, reason: string) {
    const normalizedReason = reason.trim()
    if (normalizedReason.length < 2 || normalizedReason.length > 500) throw badRequest('请填写2—500字的作废原因')
    const status = await this.repository.voidSubmissionAtomic(submissionId, normalizedReason, this.now().toISOString())
    if (status === 'not-found') throw notFound('答卷不存在')
    if (status === 'batch-closed') throw new ApiError(409, 'BATCH_CLOSED', '关闭批次不能作废答卷，请先重新开放')
    if (status === 'already-voided') throw new ApiError(409, 'ALREADY_VOIDED', '答卷已经作废')
    return { id: submissionId, status: 'voided' as const }
  }
}
