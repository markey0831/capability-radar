import type { HttpRequest } from './types'

export function corsHeaders(request: HttpRequest, allowedOrigins: ReadonlySet<string>): Record<string, string> {
  const origin = request.headers.origin
  if (!origin || !allowedOrigins.has(origin)) return { Vary: 'Origin' }
  return {
    Vary: 'Origin',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token, X-Idempotency-Key',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  }
}
