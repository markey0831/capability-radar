import { escapeHtml } from '../utils/html'

export interface AppShellOptions {
  title?: string
  backHref?: string
}

export function renderAppShell(content: string, options: AppShellOptions = {}): string {
  const back = options.backHref
    ? `<a class="text-back" href="${escapeHtml(options.backHref)}">← 返回</a>`
    : ''
  return `<div class="app-shell route-shell">
    <header class="site-header route-header">
      <div class="route-header-left">${back}</div>
      <div class="route-title">${escapeHtml(options.title ?? '')}</div>
      <div class="route-header-right"></div>
    </header>
    <main class="route-main">${content}</main>
  </div>`
}

export function renderPlaceholder(title: string, description: string): string {
  return renderAppShell(
    `<section class="panel route-placeholder">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(description)}</p>
    </section>`,
    { title },
  )
}
