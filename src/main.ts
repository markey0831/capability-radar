import './style.css'
import { createStandaloneApp } from './legacy/standalone-app'
import { createPortalApp } from './portal/portal-page'
import { Router } from './app/router'
import type { RouteMatch } from './app/router'
import { ApiClient } from './app/api-client'
import { SessionStore } from './app/session-store'
import { QuestionnairePage } from './questionnaire/questionnaire-page'
import { HttpQuestionnaireApi, MemoryQuestionnaireApi } from './questionnaire/questionnaire-api'
import type { QuestionnaireApi } from './questionnaire/types'
import { createAdminApp } from './admin/admin-app'
import { HttpAdminApi, MemoryAdminApi } from './admin/admin-api'
import type { AdminApi } from './admin/admin-api'
import { DemoStore } from './demo/demo-store'

const rootElement = document.querySelector<HTMLDivElement>('#app')
if (!rootElement) throw new Error('应用挂载节点不存在')
const root: HTMLDivElement = rootElement

type RouteKind = 'portal' | 'standalone' | 'questionnaire' | 'admin'

const routes = [
  { path: '/q/:roleCode', value: 'questionnaire' as const },
  { path: '/admin/*', value: 'admin' as const },
  { path: '/admin', value: 'admin' as const },
  { path: '/standalone', value: 'standalone' as const },
  { path: '/', value: 'portal' as const },
]

const router = new Router<RouteKind>(routes)
const adminSessionStore = new SessionStore()
const demoStore = createDemoStore()

function createQuestionnaireApi(): QuestionnaireApi {
  const baseUrl = (import.meta.env as Record<string, string | undefined> | undefined)?.VITE_API_BASE_URL
  return baseUrl ? new HttpQuestionnaireApi(new ApiClient({ baseUrl })) : new MemoryQuestionnaireApi(demoStore)
}

function createDemoStore(): DemoStore {
  try {
    return new DemoStore(window.localStorage)
  } catch {
    return new DemoStore()
  }
}

function createAdminApi(): AdminApi {
  const baseUrl = (import.meta.env as Record<string, string | undefined> | undefined)?.VITE_API_BASE_URL
  if (baseUrl) {
    const client = new ApiClient({
      baseUrl,
      getCsrfToken: () => adminSessionStore.csrfToken,
      onUnauthorized: () => adminSessionStore.clear(),
    })
    return new HttpAdminApi(client)
  }
  return new MemoryAdminApi(demoStore)
}

function renderRoute(match: RouteMatch<RouteKind> | null): void {
  const kind = match?.value ?? 'standalone'
  root.innerHTML = ''
  const host = document.createElement('div')
  host.className = 'route-host'
  root.appendChild(host)

  if (kind === 'standalone') {
    createStandaloneApp(host)
    return
  }
  if (kind === 'portal') {
    createPortalApp(host)
    return
  }
  if (kind === 'questionnaire') {
    const roleCode = match?.params.roleCode ?? ''
    const page = new QuestionnairePage(host, createQuestionnaireApi(), roleCode)
    page.mount()
    return
  }
  const hasBackend = Boolean((import.meta.env as Record<string, string | undefined> | undefined)?.VITE_API_BASE_URL)
  createAdminApp(host, createAdminApi(), {
    initialPath: router.pathname,
    demoPassword: hasBackend ? undefined : MemoryAdminApi.demoPassword,
    sessionStore: adminSessionStore,
  })
}

router.start(renderRoute)
