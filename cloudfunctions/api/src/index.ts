import { randomBytes } from 'node:crypto'
import { createApp } from './app'
import { loadConfig, loadRuntimeSecrets } from './config'
import { registerPublicRoutes } from './public/routes'
import { CloudBaseManagementRepository } from './repositories/cloudbase/management-repository'
import { MemoryFixedWindowRateLimiter } from './security/rate-limit'
import { CloudBaseAdminSessionRepository } from './repositories/cloudbase/admin-session-repository'
import { CloudBaseAdminSettingsRepository } from './repositories/cloudbase/admin-settings-repository'
import { AdminSessionService } from './security/session'
import { registerAdminAuthRoutes } from './admin/auth'
import { ApiError } from './http/errors'
import { hashAdminPassword, verifyAdminPassword } from './security/password'
import { ManagementService } from './services/management-service'
import { ResultService } from './services/result-service'
import { AuditService } from './audit/audit-service'
import { registerAdminRoutes } from './admin/routes'
import { ensureQuestionBankLoaded } from './question-bank-store'
import type { CloudBaseHttpEvent } from './http/types'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cloudbase = require('@cloudbase/node-sdk') as any

const config = loadConfig()
const secrets = loadRuntimeSecrets()
const rateLimiter = new MemoryFixedWindowRateLimiter(30, 10 * 60 * 1000)
const cloudbaseApp = cloudbase.init({ env: cloudbase.SYMBOL_DEFAULT_ENV })
const repository = new CloudBaseManagementRepository(cloudbaseApp.database())
const sessionRepository = new CloudBaseAdminSessionRepository(cloudbaseApp.database())
const settingsRepository = new CloudBaseAdminSettingsRepository(cloudbaseApp.database())
const sessionService = new AdminSessionService({ repository: sessionRepository, now: () => new Date() })
const managementService = new ManagementService({ repository, now: () => new Date() })
const resultService = new ResultService(repository, () => new Date())
const auditService = new AuditService(repository, () => new Date())

async function getPassword(): Promise<{ saltHex: string; hashHex: string }> {
  let record = await settingsRepository.getAdminPassword()
  if (!record) {
    record = {
      id: 'admin_password',
      saltHex: secrets.adminPasswordSalt,
      hashHex: secrets.adminPasswordHash,
      updatedAt: new Date().toISOString(),
    }
    await settingsRepository.saveAdminPassword(record)
  }
  return { saltHex: record.saltHex, hashHex: record.hashHex }
}

async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const current = await getPassword()
  const valid = await verifyAdminPassword(currentPassword, current.saltHex, current.hashHex)
  if (!valid) throw new ApiError(401, 'ADMIN_PASSWORD_INCORRECT', '当前密码不正确')
  const saltHex = randomBytes(16).toString('hex')
  const hashHex = await hashAdminPassword(newPassword, saltHex)
  await settingsRepository.saveAdminPassword({
    id: 'admin_password',
    saltHex,
    hashHex,
    updatedAt: new Date().toISOString(),
  })
}

const app = createApp(config, (router) => {
  registerPublicRoutes(router, {
    repository,
    taskTokenSecret: secrets.taskTokenSigningKey,
    rateLimiter,
    now: () => new Date(),
  })
  registerAdminAuthRoutes(router, {
    sessions: sessionService,
    rateLimiter: new MemoryFixedWindowRateLimiter(10, 15 * 60 * 1000),
    now: () => new Date(),
    getPassword,
    changePassword,
    allowedOrigins: config.allowedOrigins,
  })
  registerAdminRoutes(router, {
    sessions: sessionService,
    management: managementService,
    results: resultService,
    audit: auditService,
    repository,
    settingsRepository,
    allowedOrigins: config.allowedOrigins,
  })
})

export const main = async (event: CloudBaseHttpEvent) => {
  await ensureQuestionBankLoaded(
    () => settingsRepository.getQuestionBank(),
    (bank) => settingsRepository.saveQuestionBank(bank),
  )
  return app.handle(event)
}
