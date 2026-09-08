export interface RouteEntry<T> {
  path: string
  value: T
}

export interface RouteMatch<T> {
  value: T
  params: Record<string, string>
}

function splitPath(path: string): string[] {
  return path.split('/').filter(Boolean)
}

function matchSegment(pattern: string, segment: string): Record<string, string> | null {
  if (pattern.startsWith(':')) {
    const key = pattern.slice(1)
    return key ? { [key]: decodeURIComponent(segment) } : null
  }
  return pattern === segment ? {} : null
}

export function matchRoute<T>(pathname: string, routes: RouteEntry<T>[]): RouteMatch<T> | null {
  const segments = splitPath(pathname)
  for (const route of routes) {
    const patternSegments = splitPath(route.path)
    const params: Record<string, string> = {}
    let matched = true
    for (let index = 0; index < patternSegments.length; index += 1) {
      const pattern = patternSegments[index]
      if (pattern === '*') {
        params.rest = segments.slice(index).join('/')
        break
      }
      const segment = matchSegment(pattern, segments[index])
      if (segment === null) {
        matched = false
        break
      }
      Object.assign(params, segment)
    }
    if (!matched) continue
    if (!patternSegments.includes('*') && patternSegments.length !== segments.length) continue
    return { value: route.value, params }
  }
  return null
}

export class Router<T> {
  private readonly routes: RouteEntry<T>[]
  private readonly viewWindow: Window
  private handler: ((match: RouteMatch<T> | null) => void) | null = null

  constructor(routes: RouteEntry<T>[], viewWindow: Window = window) {
    this.routes = routes
    this.viewWindow = viewWindow
  }

  get pathname(): string {
    const hash = this.viewWindow.location.hash
    const raw = hash.startsWith('#') ? hash.slice(1) : hash
    if (!raw) return '/'
    return raw.startsWith('/') ? raw : `/${raw}`
  }

  match(pathname = this.pathname): RouteMatch<T> | null {
    return matchRoute(pathname, this.routes)
  }

  navigate(to: string): void {
    if (this.pathname === to) return
    this.viewWindow.location.hash = to
    this.handler?.(this.match())
  }

  start(onChange: (match: RouteMatch<T> | null) => void): () => void {
    this.handler = onChange
    const onHashChange = (): void => {
      this.handler?.(this.match())
    }
    this.viewWindow.addEventListener('hashchange', onHashChange)
    onChange(this.match())
    return () => {
      this.viewWindow.removeEventListener('hashchange', onHashChange)
      this.handler = null
    }
  }
}
