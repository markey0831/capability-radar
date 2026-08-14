export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS'

export interface HttpRequest {
  method: HttpMethod
  path: string
  headers: Record<string, string>
  query: Record<string, string>
  rawBody: string
  json: unknown
  requestId: string
}

export interface HttpResponse {
  status: number
  headers?: Record<string, string>
  body?: unknown
}

export type HttpHandler = (request: HttpRequest, params: Record<string, string>) => Promise<HttpResponse> | HttpResponse

export interface CloudBaseHttpEvent {
  path?: string
  httpMethod?: string
  headers?: Record<string, string | undefined>
  queryStringParameters?: Record<string, string | undefined>
  body?: string
  isBase64Encoded?: boolean
  requestContext?: {
    requestId?: string
  }
}

export interface CloudBaseHttpResult {
  statusCode: number
  headers: Record<string, string>
  body: string
  isBase64Encoded: false
}
