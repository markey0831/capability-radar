import type { Router } from '../http/router'
import { badRequest } from '../http/errors'
import type { PublicRepository } from '../repositories/contracts'
import type { RateLimiter } from '../security/rate-limit'
import { enforceRateLimit } from '../security/rate-limit'
import { PublicQuestionnaireService } from './public-service'
import { SubmissionService } from '../services/submission-service'

interface PublicRouteDependencies {
  repository: PublicRepository
  taskTokenSecret: string
  rateLimiter: RateLimiter
  now: () => Date
  tokenTtlMs?: number
}

function bodyObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw badRequest()
  return value as Record<string, unknown>
}

export function registerPublicRoutes(router: Router, dependencies: PublicRouteDependencies): void {
  const service = new PublicQuestionnaireService({
    repository: dependencies.repository,
    taskTokenSecret: dependencies.taskTokenSecret,
    now: dependencies.now,
    tokenTtlMs: dependencies.tokenTtlMs ?? 30 * 60 * 1000,
  })
  const submissions = new SubmissionService(dependencies)

  router.register('GET', '/public/questionnaire/:roleCode', async (_request, params) => ({
    status: 200,
    body: await service.getQuestionnaire(params.roleCode ?? ''),
  }))

  router.register('POST', '/public/tasks/lookup', async (request) => {
    const body = bodyObject(request.json)
    await enforceRateLimit(dependencies.rateLimiter, `lookup:${request.headers['x-forwarded-for'] ?? 'unknown'}`, dependencies.now().getTime())
    return {
      status: 200,
      body: await service.lookupTasks(String(body.roleId ?? ''), String(body.name ?? ''), String(body.department ?? '')),
    }
  })

  router.register('POST', '/public/tasks/form', async (request) => {
    const body = bodyObject(request.json)
    return { status: 200, body: await service.getTaskForm(String(body.token ?? '')) }
  })

  router.register('POST', '/public/submissions', async (request) => {
    const body = bodyObject(request.json)
    await enforceRateLimit(dependencies.rateLimiter, `submit:${request.headers['x-forwarded-for'] ?? 'unknown'}`, dependencies.now().getTime())
    return {
      status: 201,
      body: await submissions.submit({
        token: String(body.token ?? ''),
        idempotencyKey: String(body.idempotencyKey ?? ''),
        answers: body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers)
          ? body.answers as Record<string, unknown>
          : {},
      }),
    }
  })
}
