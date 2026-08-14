import { ApiError } from '../http/errors'

export interface RateLimiter {
  consume(key: string, nowMs: number): Promise<boolean>
}

export class MemoryFixedWindowRateLimiter implements RateLimiter {
  private readonly entries = new Map<string, { startsAt: number; count: number }>()

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  async consume(key: string, nowMs: number): Promise<boolean> {
    const current = this.entries.get(key)
    if (!current || current.startsAt + this.windowMs <= nowMs) {
      this.entries.set(key, { startsAt: nowMs, count: 1 })
      return true
    }
    if (current.count >= this.limit) return false
    current.count += 1
    return true
  }
}

export async function enforceRateLimit(limiter: RateLimiter, key: string, nowMs: number): Promise<void> {
  if (!(await limiter.consume(key, nowMs))) {
    throw new ApiError(429, 'RATE_LIMITED', '操作过于频繁，请稍后再试')
  }
}
