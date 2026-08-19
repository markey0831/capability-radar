import { describe, expect, it } from 'vitest'
import { MemoryManagementRepository } from '../repositories/memory/management-repository'
import { ResultService } from './result-service'
import { closeExpiredBatches } from './batch-lifecycle'

const NOW = new Date('2026-08-15T00:00:00.000Z')

describe('closeExpiredBatches', () => {
  it('closes only open batches whose deadline has passed', async () => {
    const repository = new MemoryManagementRepository({
      batches: [
        {
          id: 'expired-open',
          name: '已到期开放批次',
          roleId: 'sales',
          questionnaireVersionId: 'v1',
          assessmentDate: '2026-08-01',
          startsAt: '2026-08-01T00:00:00.000Z',
          deadlineAt: '2026-08-14T23:59:59.000Z',
          status: 'open',
        },
        {
          id: 'future-open',
          name: '未到期开放批次',
          roleId: 'sales',
          questionnaireVersionId: 'v1',
          assessmentDate: '2026-08-01',
          startsAt: '2026-08-01T00:00:00.000Z',
          deadlineAt: '2026-08-20T00:00:00.000Z',
          status: 'open',
        },
        {
          id: 'expired-draft',
          name: '已到期草稿',
          roleId: 'sales',
          questionnaireVersionId: 'v1',
          assessmentDate: '2026-08-01',
          startsAt: '2026-08-01T00:00:00.000Z',
          deadlineAt: '2026-08-14T23:59:59.000Z',
          status: 'draft',
        },
      ],
    })
    const resultService = new ResultService(repository, () => NOW)

    const result = await closeExpiredBatches({ repository, resultService, now: () => NOW })

    expect(result.closed).toEqual(['expired-open'])
    expect(result.failed).toEqual([])
    expect((await repository.getBatch('expired-open'))?.status).toBe('closed')
    expect((await repository.getBatch('future-open'))?.status).toBe('open')
    expect((await repository.getBatch('expired-draft'))?.status).toBe('draft')
  })
})
