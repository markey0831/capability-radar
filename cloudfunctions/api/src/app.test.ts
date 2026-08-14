import { describe, expect, it } from 'vitest'
import { createApp } from './app'
import type { ApiConfig } from './config'

const config: ApiConfig = {
  appEnv: 'test',
  allowedOrigins: new Set(['https://app.example.com']),
  maxJsonBodyBytes: 64,
}

function event(path: string, options: Record<string, unknown> = {}) {
  return {
    path,
    httpMethod: 'GET',
    headers: { origin: 'https://app.example.com' },
    requestContext: { requestId: 'request-1' },
    ...options,
  }
}

describe('CloudBase HTTP API shell', () => {
  it('serves a health route with security and allowed CORS headers', async () => {
    const response = await createApp(config).handle(event('/health'))
    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ ok: true })
    expect(response.headers['Access-Control-Allow-Origin']).toBe('https://app.example.com')
    expect(response.headers['Access-Control-Allow-Credentials']).toBe('true')
    expect(response.headers['X-Content-Type-Options']).toBe('nosniff')
  })

  it('does not reflect an unapproved origin', async () => {
    const response = await createApp(config).handle(event('/health', { headers: { origin: 'https://evil.example' } }))
    expect(response.statusCode).toBe(200)
    expect(response.headers['Access-Control-Allow-Origin']).toBeUndefined()
    expect(response.headers.Vary).toBe('Origin')
  })

  it('returns a stable 404 structure', async () => {
    const response = await createApp(config).handle(event('/missing'))
    expect(response.statusCode).toBe(404)
    expect(JSON.parse(response.body)).toEqual({
      error: { code: 'NOT_FOUND', message: '未找到请求的内容' },
      requestId: 'request-1',
    })
  })

  it('rejects non-JSON writes and oversized bodies', async () => {
    const wrongType = await createApp(config).handle(event('/missing', {
      httpMethod: 'POST',
      headers: { origin: 'https://app.example.com', 'content-type': 'text/plain' },
      body: '{}',
    }))
    expect(wrongType.statusCode).toBe(415)

    const tooLarge = await createApp(config).handle(event('/missing', {
      httpMethod: 'POST',
      headers: { origin: 'https://app.example.com', 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(100) }),
    }))
    expect(tooLarge.statusCode).toBe(413)
  })

  it('does not leak stacks or internal messages', async () => {
    const response = await createApp(config, (router) => {
      router.register('GET', '/explode', () => {
        throw new Error('database password=secret')
      })
    }).handle(event('/explode'))
    expect(response.statusCode).toBe(500)
    expect(response.body).not.toContain('database')
    expect(response.body).not.toContain('secret')
    expect(response.body).not.toContain('at ')
  })
})
