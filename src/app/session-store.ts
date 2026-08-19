const DEFAULT_KEY = 'capability-radar:admin-session'

export interface AdminSessionSnapshot {
  csrfToken: string | null
}

export class SessionStore {
  private readonly storage: Storage
  private readonly key: string

  constructor(storage: Storage = window.sessionStorage, key: string = DEFAULT_KEY) {
    this.storage = storage
    this.key = key
  }

  get csrfToken(): string | null {
    return this.read().csrfToken
  }

  setCsrfToken(token: string): void {
    this.write({ csrfToken: token })
  }

  clear(): void {
    try {
      this.storage.removeItem(this.key)
    } catch {
      // 忽略浏览器禁用 sessionStorage 的场景。
    }
  }

  private read(): AdminSessionSnapshot {
    try {
      const raw = this.storage.getItem(this.key)
      if (!raw) return { csrfToken: null }
      const parsed = JSON.parse(raw) as Partial<AdminSessionSnapshot>
      return { csrfToken: typeof parsed.csrfToken === 'string' ? parsed.csrfToken : null }
    } catch {
      return { csrfToken: null }
    }
  }

  private write(snapshot: AdminSessionSnapshot): void {
    try {
      this.storage.setItem(this.key, JSON.stringify(snapshot))
    } catch {
      // 忽略浏览器禁用 sessionStorage 的场景。
    }
  }
}
