import { describe, expect, it } from 'vitest'
import { MemoryAdminApi } from './admin-api'

function decodeBase64(data: string): string {
  const bytes = Uint8Array.from(atob(data), (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

describe('MemoryAdminApi', () => {
  it('rejects a wrong password and accepts the demo password', async () => {
    const api = new MemoryAdminApi()
    await expect(api.login('wrong')).rejects.toMatchObject({ status: 401, code: 'ADMIN_LOGIN_FAILED' })
    await expect(api.login(MemoryAdminApi.demoPassword)).resolves.toMatchObject({ authenticated: true, csrfToken: 'demo-csrf-token' })
  })

  it('requires authentication for data endpoints', async () => {
    const api = new MemoryAdminApi()
    await expect(api.listRoles()).rejects.toMatchObject({ status: 401, code: 'ADMIN_UNAUTHORIZED' })
    await api.login(MemoryAdminApi.demoPassword)
    await expect(api.listRoles()).resolves.toHaveLength(7)
  })

  it('creates and lists people', async () => {
    const api = new MemoryAdminApi()
    await api.login(MemoryAdminApi.demoPassword)
    await api.createPerson({
      name: '张三',
      department: '销售部',
      currentRoleId: 'sales',
      canBeEvaluatee: true,
      canBeRater: false,
    })
    await expect(api.listPeople()).resolves.toEqual([
      expect.objectContaining({ name: '张三', department: '销售部', currentRoleId: 'sales' }),
    ])
  })

  it('updates a person status', async () => {
    const api = new MemoryAdminApi()
    await api.login(MemoryAdminApi.demoPassword)
    const person = await api.createPerson({ name: '张三', department: '销售部', currentRoleId: null, canBeEvaluatee: true, canBeRater: true })
    const updated = await api.updatePerson(person, 'inactive')
    expect(updated.status).toBe('inactive')
    expect((await api.listPeople())[0].status).toBe('inactive')
  })

  it('deletes only unreferenced people', async () => {
    const api = new MemoryAdminApi()
    await api.login(MemoryAdminApi.demoPassword)
    const person = await api.createPerson({ name: '张三', department: '销售部', currentRoleId: null, canBeEvaluatee: true, canBeRater: true })
    const batch = await api.createBatch({ name: '批次', roleId: 'sales', assessmentDate: '2026-08-13', startsAt: '2026-08-01T00:00:00Z', deadlineAt: '2026-08-31T00:00:00Z' })
    const participant = await api.addParticipant(batch.id, person.id)
    await expect(api.deletePerson(person.id)).resolves.toMatchObject({ deleted: false })

    const fresh = await api.createPerson({ name: '李四', department: '管理部', currentRoleId: null, canBeEvaluatee: false, canBeRater: true })
    await expect(api.deletePerson(fresh.id)).resolves.toMatchObject({ deleted: true })
    expect((await api.listPeople()).some((candidate) => candidate.id === fresh.id)).toBe(false)
    expect(participant).toBeDefined()
  })

  it('manages a batch through participants, assignments, open and export', async () => {
    const api = new MemoryAdminApi()
    await api.login(MemoryAdminApi.demoPassword)
    const person = await api.createPerson({ name: '张三', department: '销售部', currentRoleId: 'sales', canBeEvaluatee: true, canBeRater: false })
    const rater = await api.createPerson({ name: '李经理', department: '业务中心', currentRoleId: null, canBeEvaluatee: false, canBeRater: true })
    const batch = await api.createBatch({
      name: '2026年第三季度评估',
      roleId: 'sales',
      assessmentDate: '2026-08-13',
      startsAt: '2026-08-01T00:00:00Z',
      deadlineAt: '2026-08-31T00:00:00Z',
    })
    const participant = await api.addParticipant(batch.id, person.id)
    await api.addAssignment(batch.id, participant.id, rater.id, 'superior')

    const details = await api.getBatchDetails(batch.id)
    expect(details.participants).toHaveLength(1)
    expect(details.assignments).toHaveLength(1)

    await api.openBatch(batch.id)
    expect((await api.getBatchDetails(batch.id)).batch.status).toBe('open')

    const file = await api.exportBatch(batch.id)
    expect(file.contentType).toBe('text/csv')
    expect(decodeBase64(file.data)).toContain('张三')
  })

  it('extends, closes, archives and copies a batch', async () => {
    const api = new MemoryAdminApi()
    await api.login(MemoryAdminApi.demoPassword)
    const person = await api.createPerson({ name: '王小明', department: '数字业务部', currentRoleId: 'sales', canBeEvaluatee: true, canBeRater: false })
    const rater = await api.createPerson({ name: '张三', department: '销售部', currentRoleId: null, canBeEvaluatee: false, canBeRater: true })
    const batch = await api.createBatch({ name: '批次', roleId: 'sales', assessmentDate: '2026-08-13', startsAt: '2026-08-01T00:00:00Z', deadlineAt: '2026-08-31T00:00:00Z' })
    const participant = await api.addParticipant(batch.id, person.id)
    await api.addAssignment(batch.id, participant.id, rater.id, 'superior')
    await api.openBatch(batch.id)

    const extended = await api.extendBatch(batch.id, '2026-09-15T00:00:00Z')
    expect(extended.deadlineAt).toBe('2026-09-15T00:00:00Z')

    await api.closeBatch(batch.id)
    await api.archiveBatch(batch.id)
    expect((await api.getBatchDetails(batch.id)).batch.status).toBe('archived')

    const copy = await api.copyBatch(batch.id, { name: '复制批次', assessmentDate: '2026-10-01', startsAt: '2026-10-01T00:00:00Z', deadlineAt: '2026-10-31T00:00:00Z' })
    expect(copy).toMatchObject({ copiedParticipants: 1, copiedAssignments: 1 })
    expect(copy.batch.status).toBe('draft')
    expect((await api.getBatchDetails(copy.batch.id)).participants).toHaveLength(1)
  })
})
