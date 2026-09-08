import { CloudBaseManagementRepository } from '../../api/src/repositories/cloudbase/management-repository'
import { ResultService } from '../../api/src/services/result-service'
import { closeExpiredBatches } from '../../api/src/services/batch-lifecycle'

const cloudbase = require('@cloudbase/node-sdk') as any

async function keepApiWarm(): Promise<void> {
  try {
    await fetch('https://bluefocus-d3grkg8s6e8a44be6-1467982443.ap-shanghai.app.tcloudbase.com/health')
  } catch {
    // 保活失败不影响到期关闭逻辑。
  }
}

export async function main(): Promise<{ ok: boolean; result: unknown }> {
  await keepApiWarm()
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
