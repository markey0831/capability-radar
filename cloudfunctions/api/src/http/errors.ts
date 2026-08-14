export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function badRequest(message = '请求内容不正确'): ApiError {
  return new ApiError(400, 'BAD_REQUEST', message)
}

export function notFound(message = '未找到请求的内容'): ApiError {
  return new ApiError(404, 'NOT_FOUND', message)
}

export function unsupportedMediaType(): ApiError {
  return new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', '请使用 JSON 格式提交')
}

export function payloadTooLarge(): ApiError {
  return new ApiError(413, 'PAYLOAD_TOO_LARGE', '提交内容过大')
}
