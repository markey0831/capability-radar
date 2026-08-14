import { notFound } from './errors'
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponse } from './types'

interface Route {
  method: HttpMethod
  pattern: string
  segments: string[]
  handler: HttpHandler
}

function matchRoute(route: Route, method: HttpMethod, path: string): Record<string, string> | null {
  if (route.method !== method) return null
  const actualSegments = path.split('/').filter(Boolean)
  if (actualSegments.length !== route.segments.length) return null
  const params: Record<string, string> = {}
  for (let index = 0; index < route.segments.length; index += 1) {
    const expected = route.segments[index]!
    const actual = actualSegments[index]!
    if (expected.startsWith(':')) params[expected.slice(1)] = decodeURIComponent(actual)
    else if (expected !== actual) return null
  }
  return params
}

export class Router {
  private readonly routes: Route[] = []

  register(method: HttpMethod, pattern: string, handler: HttpHandler): void {
    this.routes.push({ method, pattern, segments: pattern.split('/').filter(Boolean), handler })
  }

  async dispatch(request: HttpRequest): Promise<HttpResponse> {
    for (const route of this.routes) {
      const params = matchRoute(route, request.method, request.path)
      if (params) return route.handler(request, params)
    }
    throw notFound()
  }
}
