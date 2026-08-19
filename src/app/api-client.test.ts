import { describe, expect, it, vi } from 'vitest'
import { ApiClient } from './api-client'

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

describe('ApiClient', () => {
  it('returns parsed JSON for successful GET requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }))
    const client = new ApiClient({ baseUrl: 'https://api.example.com/', fetch: fetchMock })

    await expect(client.get('/health')).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/health',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    )
  })

  it('maps non-ok responses to a stable ApiError', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(
      { error: { code: 'BAD_REQUEST', message: '请求内容不正确' }, requestId: 'req-1' },
      400,
      { 'X-Request-Id': 'req-1' },
    ))
    const client = new ApiClient({ fetch: fetchMock })

    await expect(client.post('/admin/people', {})).rejects.toMatchObject({
      status: 400,
      code: 'BAD_REQUEST',
      message: '请求内容不正确',
      requestId: 'req-1',
    })
  })

  it('attaches the CSRF token to write requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(null, 204))
    const client = new ApiClient({ fetch: fetchMock, getCsrfToken: () => 'csrf-token' })

    await client.post('/admin/batches', { name: '批次' })
    const request = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = new Headers(request[1].headers)
    expect(headers.get('X-CSRF-Token')).toBe('csrf-token')
    expect(headers.get('Content-Type')).toBe('application/json')
  })
})
