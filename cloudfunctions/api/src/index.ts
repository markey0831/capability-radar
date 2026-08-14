import { createApp } from './app'
import { loadConfig, loadRuntimeSecrets } from './config'
import { registerPublicRoutes } from './public/routes'
import { CloudBaseManagementRepository } from './repositories/cloudbase/management-repository'
import { MemoryFixedWindowRateLimiter } from './security/rate-limit'
import { CloudBaseAdminSessionRepository } from './repositories/cloudbase/admin-session-repository'
import { AdminSessionService } from './security/session'
import { registerAdminAuthRoutes } from './admin/auth'
import { ManagementService } from './services/management-service'
import { ResultService } from './services/result-service'
import { AuditService } from './audit/audit-service'
import { registerAdminRoutes } from './admin/routes'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cloudbase = require('@cloudbase/node-sdk') as any

const config = loadConfig()
const secrets = loadRuntimeSecrets()
const rateLimiter = new MemoryFixedWindowRateLimiter(30, 10 * 60 * 1000)
const cloudbaseApp = cloudbase.init({ env: cloudbase.SYMBOL_DEFAULT_ENV })
const repository = new CloudBaseManagementRepository(cloudbaseApp.database())
const sessionRepository = new CloudBaseAdminSessionRepository(cloudbaseApp.database())
const sessionService = new AdminSessionService({ repository: sessionRepository, now: () => new Date() })
const managementService = new ManagementService({ repository, now: () => new Date() })
const resultService = new ResultService(repository, () => new Date())
const auditService = new AuditService(repository, () => new Date())
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
    passwordSalt: secrets.adminPasswordSalt,
    passwordHash: secrets.adminPasswordHash,
    allowedOrigins: config.allowedOrigins,
  })
  registerAdminRoutes(router, {
    sessions: sessionService,
    management: managementService,
    results: resultService,
    audit: auditService,
    allowedOrigins: config.allowedOrigins,
  })
})

export const main = app.handle
