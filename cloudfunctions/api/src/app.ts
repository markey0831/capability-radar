import { randomUUID } from 'node:crypto'
import { loadConfig } from './config'
import type { ApiConfig } from './config'
import { ApiError, badRequest, payloadTooLarge, unsupportedMediaType } from './http/errors'
import { corsHeaders } from './http/cors'
import { Router } from './http/router'
import type { CloudBaseHttpEvent, CloudBaseHttpResult, HttpMethod, HttpRequest } from './http/types'

export type ConfigureRoutes = (router: Router) => void

function normalizeHeaders(headers: CloudBaseHttpEvent['headers']): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .map(([key, value]) => [key.toLowerCase(), value]),
  )
}

function parseRequest(event: CloudBaseHttpEvent, config: ApiConfig): HttpRequest {
  const method = (event.httpMethod ?? 'GET').toUpperCase() as HttpMethod
  const headers = normalizeHeaders(event.headers)
  const rawBody = event.body
    ? event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body
    : ''
  if (Buffer.byteLength(rawBody, 'utf8') > config.maxJsonBodyBytes) throw payloadTooLarge()

  const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
  if (isWrite && rawBody && !headers['content-type']?.toLowerCase().startsWith('application/json')) {
    throw unsupportedMediaType()
  }
  let json: unknown = null
  if (rawBody) {
    try {
      json = JSON.parse(rawBody) as unknown
    } catch {
      throw badRequest('JSON 内容无法解析')
    }
  }
  return {
    method,
    path: event.path ?? '/',
    headers,
    query: Object.fromEntries(
      Object.entries(event.queryStringParameters ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    ),
    rawBody,
    json,
    requestId: event.requestContext?.requestId ?? randomUUID(),
  }
}

function serialize(
  statusCode: number,
  requestId: string,
  body: unknown,
  headers: Record<string, string>,
): CloudBaseHttpResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Request-Id': requestId,
      ...headers,
    },
    body: body === undefined ? '' : JSON.stringify(body),
    isBase64Encoded: false,
  }
}

export function createApp(config: ApiConfig = loadConfig(), configureRoutes?: ConfigureRoutes) {
  const router = new Router()
  router.register('GET', '/health', () => ({ status: 200, body: { ok: true } }))
  configureRoutes?.(router)

  return {
    async handle(event: CloudBaseHttpEvent): Promise<CloudBaseHttpResult> {
      let request: HttpRequest | null = null
      const fallbackRequestId = event.requestContext?.requestId ?? randomUUID()
      try {
        request = parseRequest(event, config)
        const cors = corsHeaders(request, config.allowedOrigins)
        if (request.method === 'OPTIONS') return serialize(204, request.requestId, undefined, cors)
        const response = await router.dispatch(request)
        return serialize(response.status, request.requestId, response.body, { ...cors, ...response.headers })
      } catch (error) {
        const requestId = request?.requestId ?? fallbackRequestId
        const cors = request ? corsHeaders(request, config.allowedOrigins) : { Vary: 'Origin' }
        if (error instanceof ApiError) {
          return serialize(error.status, requestId, { error: { code: error.code, message: error.message }, requestId }, cors)
        }
        return serialize(
          500,
          requestId,
          { error: { code: 'INTERNAL_ERROR', message: '服务暂时不可用，请稍后重试' }, requestId },
          cors,
        )
      }
    },
  }
}
