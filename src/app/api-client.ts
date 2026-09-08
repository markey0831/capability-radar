export interface ApiClientOptions {
  baseUrl?: string
  fetch?: typeof fetch
  timeoutMs?: number
  getCsrfToken?: () => string | null
  onUnauthorized?: () => void
}

interface ApiErrorEnvelope {
  error?: {
    code?: string
    message?: string
  }
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId?: string

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
  }
}

export class ApiClient {
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private readonly getCsrfToken: () => string | null
  private readonly onUnauthorized: () => void

  constructor(options: ApiClientOptions = {}) {
    const env = import.meta.env as Record<string, string | undefined> | undefined
    this.baseUrl = (options.baseUrl ?? env?.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
    this.fetchImpl = options.fetch ?? fetch
    this.timeoutMs = options.timeoutMs ?? 30_000
    this.getCsrfToken = options.getCsrfToken ?? (() => null)
    this.onUnauthorized = options.onUnauthorized ?? (() => undefined)
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const method = (init.method ?? 'GET').toUpperCase()
    const headers = new Headers(init.headers)
    if (!headers.has('Accept')) headers.set('Accept', 'application/json')
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    const csrfToken = this.getCsrfToken()
    if (csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('X-CSRF-Token', csrfToken)

    const retryDelays = [3000, 8000]
    for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
      try {
        return await this.requestOnce<T>(path, init, method, headers)
      } catch (error) {
        const retryable = error instanceof ApiError && (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT')
        if (!retryable || attempt >= retryDelays.length) throw error
        await new Promise((resolve) => globalThis.setTimeout(resolve, retryDelays[attempt]))
      }
    }
    throw new ApiError(0, 'NETWORK_ERROR', '网络连接失败，请稍后重试')
  }

  private async requestOnce<T>(
    path: string,
    init: RequestInit,
    method: string,
    headers: Headers,
  ): Promise<T> {
    const controller = new AbortController()
    const timeout = globalThis.setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        method,
        headers,
        credentials: 'include',
        signal: controller.signal,
      })
      if (response.status === 401) this.onUnauthorized()
      const text = await response.text()
      let data: unknown = null
      if (text) {
        try {
          data = JSON.parse(text)
        } catch {
          throw new ApiError(0, 'INVALID_RESPONSE', '服务返回内容无法解析', response.headers.get('X-Request-Id') ?? undefined)
        }
      }
      if (!response.ok) {
        const envelope = data as ApiErrorEnvelope | null
        throw new ApiError(
          response.status,
          envelope?.error?.code ?? 'HTTP_ERROR',
          envelope?.error?.message ?? '请求失败，请稍后重试',
          response.headers.get('X-Request-Id') ?? undefined,
        )
      }
      return data as T
    } catch (error) {
      if (error instanceof ApiError) throw error
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ApiError(0, 'TIMEOUT', '请求超时，请稍后重试')
      }
      throw new ApiError(0, 'NETWORK_ERROR', '网络连接失败，请稍后重试')
    } finally {
      globalThis.clearTimeout(timeout)
    }
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' })
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) })
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' })
  }
}
