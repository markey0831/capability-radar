import { createHmac, timingSafeEqual } from 'node:crypto'
import { ApiError } from '../http/errors'

interface TaskTokenPayload {
  assignmentId: string
  batchId: string
  questionnaireVersionId: string
  expiresAt: number
}

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function sign(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url')
}

export function issueTaskToken(payload: TaskTokenPayload, secret: string): string {
  const encodedPayload = encode(JSON.stringify(payload))
  return `${encodedPayload}.${sign(encodedPayload, secret)}`
}

export function verifyTaskToken(token: string, secret: string, nowMs: number): TaskTokenPayload {
  const [encodedPayload, signature, extra] = token.split('.')
  if (!encodedPayload || !signature || extra) throw new ApiError(401, 'INVALID_TASK_TOKEN', '评价任务凭证无效，请重新验证身份')
  const expected = sign(encodedPayload, secret)
  const providedBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new ApiError(401, 'INVALID_TASK_TOKEN', '评价任务凭证无效，请重新验证身份')
  }
  let payload: TaskTokenPayload
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as TaskTokenPayload
  } catch {
    throw new ApiError(401, 'INVALID_TASK_TOKEN', '评价任务凭证无效，请重新验证身份')
  }
  if (
    !payload.assignmentId
    || !payload.batchId
    || !payload.questionnaireVersionId
    || !Number.isFinite(payload.expiresAt)
  ) throw new ApiError(401, 'INVALID_TASK_TOKEN', '评价任务凭证无效，请重新验证身份')
  if (payload.expiresAt <= nowMs) throw new ApiError(401, 'EXPIRED_TASK_TOKEN', '评价任务凭证已过期，请重新验证身份')
  return payload
}
