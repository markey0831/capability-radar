import type { ResultsRepository } from '../repositories/contracts'
import type { ResultService } from './result-service'

export interface CloseExpiredBatchesResult {
  closed: string[]
  failed: Array<{ batchId: string; error: string }>
}

export async function closeExpiredBatches(dependencies: {
  repository: ResultsRepository
  resultService: ResultService
  now: () => Date
}): Promise<CloseExpiredBatchesResult> {
  const nowIso = dependencies.now().toISOString()
  const batches = await dependencies.repository.listBatches()
  const expired = batches.filter((batch) => batch.status === 'open' && batch.deadlineAt <= nowIso)
  const result: CloseExpiredBatchesResult = { closed: [], failed: [] }
  for (const batch of expired) {
    try {
      await dependencies.resultService.closeBatch(batch.id)
      result.closed.push(batch.id)
    } catch (error) {
      result.failed.push({
        batchId: batch.id,
        error: error instanceof Error ? error.message : '未知错误',
      })
    }
  }
  return result
}
