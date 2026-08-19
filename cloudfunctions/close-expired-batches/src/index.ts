import { CloudBaseManagementRepository } from '../../api/src/repositories/cloudbase/management-repository'
import { ResultService } from '../../api/src/services/result-service'
import { closeExpiredBatches } from '../../api/src/services/batch-lifecycle'

const cloudbase = require('@cloudbase/node-sdk') as any

export async function main(): Promise<{ ok: boolean; result: unknown }> {
  const app = cloudbase.init({ env: cloudbase.SYMBOL_DEFAULT_ENV })
  const repository = new CloudBaseManagementRepository(app.database())
  const resultService = new ResultService(repository, () => new Date())
  const result = await closeExpiredBatches({
    repository,
    resultService,
    now: () => new Date(),
  })
  return { ok: result.failed.length === 0, result }
}
