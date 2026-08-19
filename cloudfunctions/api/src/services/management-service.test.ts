import { describe, expect, it } from 'vitest'
import { MemoryManagementRepository } from '../repositories/memory/management-repository'
import { ManagementService } from './management-service'

function ids(...values: string[]) {
  const queue = [...values]
  return () => queue.shift()!
}

describe('management service', () => {
  it('keeps a participant snapshot unchanged after editing the person', async () => {
    const repository = new MemoryManagementRepository()
    const service = new ManagementService({ repository, now: () => new Date(), createId: ids('person-1', 'batch-1', 'participant-1') })
    const person = await service.createPerson({ name: '张三', department: '销售一部', currentRoleId: 'sales', canBeEvaluatee: true, canBeRater: false })
    const batch = await service.createBatch({ name: '测试批次', roleId: 'sales', assessmentDate: '2026-08-13', startsAt: '2026-08-01T00:00:00Z', deadlineAt: '2026-08-31T00:00:00Z' })
    const participant = await service.addParticipant(batch.id, person.id)
    await service.updatePerson(person.id, { name: '张三', department: '商务部', currentRoleId: 'business' })
    expect(participant).toMatchObject({ nameSnapshot: '张三', departmentSnapshot: '销售一部', roleIdSnapshot: 'sales' })
    expect(await repository.getParticipant(participant.id)).toMatchObject({ departmentSnapshot: '销售一部', roleIdSnapshot: 'sales' })
  })

  it('prevents two open batches for the same role', async () => {
    const repository = new MemoryManagementRepository()
    const service = new ManagementService({ repository, now: () => new Date(), createId: ids('evaluatee', 'rater', 'batch-1', 'participant-1', 'assignment-1', 'batch-2', 'participant-2', 'assignment-2') })
    const evaluatee = await service.createPerson({ name: '张三', department: '销售部', currentRoleId: 'sales', canBeEvaluatee: true, canBeRater: false })
    const rater = await service.createPerson({ name: '李经理', department: '管理部', canBeEvaluatee: false, canBeRater: true })
    for (const suffix of ['1', '2']) {
      const batch = await service.createBatch({ name: `批次${suffix}`, roleId: 'sales', assessmentDate: '2026-08-13', startsAt: '2026-08-01T00:00:00Z', deadlineAt: '2026-08-31T00:00:00Z' })
      const participant = await service.addParticipant(batch.id, evaluatee.id)
      await service.addAssignment(batch.id, participant.id, rater.id, 'superior')
      if (suffix === '1') await expect(service.openBatch(batch.id)).resolves.toMatchObject({ status: 'open' })
      else await expect(service.openBatch(batch.id)).rejects.toMatchObject({ code: 'ROLE_BATCH_ALREADY_OPEN' })
    }
  })

  it('blocks opening when two people have the same normalized name and department', async () => {
    const repository = new MemoryManagementRepository()
    const service = new ManagementService({ repository, now: () => new Date(), createId: ids('evaluatee', 'rater-1', 'rater-2', 'batch', 'participant', 'assignment-1', 'assignment-2') })
    const evaluatee = await service.createPerson({ name: '张三', department: '销售部', currentRoleId: 'sales', canBeEvaluatee: true, canBeRater: false })
    const rater1 = await service.createPerson({ name: '王五', department: '产品中心　XR组', canBeEvaluatee: false, canBeRater: true })
    const rater2 = await service.createPerson({ name: '王五', department: '产品中心 XR组', canBeEvaluatee: false, canBeRater: true })
    const batch = await service.createBatch({ name: '批次', roleId: 'sales', assessmentDate: '2026-08-13', startsAt: '2026-08-01T00:00:00Z', deadlineAt: '2026-08-31T00:00:00Z' })
    const participant = await service.addParticipant(batch.id, evaluatee.id)
    await service.addAssignment(batch.id, participant.id, rater1.id, 'peer')
    await service.addAssignment(batch.id, participant.id, rater2.id, 'peer')
    await expect(service.openBatch(batch.id)).rejects.toMatchObject({ code: 'AMBIGUOUS_RATER_IDENTITY' })
  })

  it('only allows editing basic information while a batch is a draft', async () => {
    const repository = new MemoryManagementRepository()
    const service = new ManagementService({ repository, now: () => new Date(), createId: ids('batch') })
    const batch = await service.createBatch({
      name: '原批次',
      roleId: 'sales',
      assessmentDate: '2026-08-13',
      startsAt: '2026-08-01T00:00:00Z',
      deadlineAt: '2026-08-31T00:00:00Z',
    })
    const updated = await service.updateBatch(batch.id, {
      name: '新批次',
      assessmentDate: '2026-09-01',
      startsAt: '2026-09-01T00:00:00Z',
      deadlineAt: '2026-09-30T00:00:00Z',
    })
    expect(updated).toMatchObject({ id: batch.id, name: '新批次', status: 'draft', roleId: 'sales' })
    repository.batches.set(batch.id, { ...batch, status: 'open' })
    await expect(service.updateBatch(batch.id, {
      name: '再改',
      assessmentDate: '2026-10-01',
      startsAt: '2026-10-01T00:00:00Z',
      deadlineAt: '2026-10-31T00:00:00Z',
    })).rejects.toMatchObject({ code: 'BATCH_NOT_EDITABLE' })
  })

  it('extends the deadline only for an open batch and requires a later deadline', async () => {
    const repository = new MemoryManagementRepository()
    const service = new ManagementService({ repository, now: () => new Date(), createId: ids('batch') })
    const batch = await service.createBatch({
      name: '批次',
      roleId: 'sales',
      assessmentDate: '2026-08-13',
      startsAt: '2026-08-01T00:00:00Z',
      deadlineAt: '2026-08-31T00:00:00Z',
    })
    await expect(service.extendBatch(batch.id, '2026-09-15T00:00:00Z')).rejects.toMatchObject({ code: 'BATCH_NOT_OPEN' })
    repository.batches.set(batch.id, { ...batch, status: 'open' })
    await expect(service.extendBatch(batch.id, '2026-08-30T00:00:00Z')).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    const extended = await service.extendBatch(batch.id, '2026-09-15T00:00:00Z')
    expect(extended.deadlineAt).toBe('2026-09-15T00:00:00Z')
    expect(extended.status).toBe('open')
  })

  it('archives only a closed batch', async () => {
    const repository = new MemoryManagementRepository()
    const service = new ManagementService({ repository, now: () => new Date(), createId: ids('batch') })
    const batch = await service.createBatch({
      name: '批次',
      roleId: 'sales',
      assessmentDate: '2026-08-13',
      startsAt: '2026-08-01T00:00:00Z',
      deadlineAt: '2026-08-31T00:00:00Z',
    })
    await expect(service.archiveBatch(batch.id)).rejects.toMatchObject({ code: 'BATCH_NOT_CLOSED' })
    repository.batches.set(batch.id, { ...batch, status: 'closed' })
    const archived = await service.archiveBatch(batch.id)
    expect(archived.status).toBe('archived')
  })

  it('copies a previous batch into a new draft with fresh participant and assignment ids', async () => {
    const repository = new MemoryManagementRepository()
    let counter = 0
    const service = new ManagementService({ repository, now: () => new Date(), createId: () => `id-${++counter}` })
    const evaluatee = await service.createPerson({ name: '张三', department: '销售部', currentRoleId: 'sales', canBeEvaluatee: true, canBeRater: false })
    const rater = await service.createPerson({ name: '李经理', department: '管理部', canBeEvaluatee: false, canBeRater: true })
    const source = await service.createBatch({
      name: '源批次',
      roleId: 'sales',
      assessmentDate: '2026-08-13',
      startsAt: '2026-08-01T00:00:00Z',
      deadlineAt: '2026-08-31T00:00:00Z',
    })
    const participant = await service.addParticipant(source.id, evaluatee.id)
    await service.addAssignment(source.id, participant.id, rater.id, 'superior')

    const result = await service.copyBatch(source.id, {
      name: '复制批次',
      assessmentDate: '2026-09-01',
      startsAt: '2026-09-01T00:00:00Z',
      deadlineAt: '2026-09-30T00:00:00Z',
    })
    expect(result).toMatchObject({ copiedParticipants: 1, copiedAssignments: 1 })
    expect(result.batch).toMatchObject({ name: '复制批次', roleId: 'sales', status: 'draft' })

    const newParticipants = await repository.listParticipants(result.batch.id)
    const newAssignments = await repository.listAssignments(result.batch.id)
    expect(newParticipants).toHaveLength(1)
    expect(newParticipants[0].id).not.toBe(participant.id)
    expect(newParticipants[0].batchId).toBe(result.batch.id)
    expect(newAssignments).toHaveLength(1)
    expect(newAssignments[0]).toMatchObject({ status: 'pending', currentSubmissionId: null, submittedAt: null })
    expect(newAssignments[0].participantId).toBe(newParticipants[0].id)
    expect(newAssignments[0].raterPersonId).toBe(rater.id)
  })
})
