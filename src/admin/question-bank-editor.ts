import { escapeHtml } from '../utils/html'
import type { QuestionBank, QuestionBankRole } from '../../shared/question-bank/schema'

export interface QuestionBankEditorOptions {
  api: {
    getQuestionBank(): Promise<QuestionBank>
    saveQuestionBankRole(roleId: string, role: QuestionBankRole): Promise<unknown>
  }
  onBack(): void
}

const CODES = ['A', 'B', 'C', 'D', 'E'] as const

export function mountQuestionBankEditor(host: HTMLElement, options: QuestionBankEditorOptions): void {
  let bank: QuestionBank | null = null
  let roleIndex = 0
  let busy = false
  let notice = ''

  function render(): void {
    if (!bank) {
      host.innerHTML = '<section class="panel admin-panel"><p>正在加载题库…</p></section>'
      return
    }
    const role = bank.roles[roleIndex]
    if (!role) return

    host.innerHTML = `
      <div class="admin-shell">
        <header class="site-header admin-header">
          <div class="admin-title">管理后台</div>
          <nav class="admin-nav">
            <button type="button" class="nav-button" data-bank-back>返回</button>
          </nav>
        </header>
        <main class="route-main admin-main">
          <section class="panel admin-panel">
            <h1>题库管理</h1>
            ${notice ? `<div class="inline-warning">${escapeHtml(notice)}</div>` : ''}
            <div class="bank-role-bar">
              ${bank.roles.map((item, index) => `<button type="button" class="nav-button ${index === roleIndex ? 'active' : ''}" data-bank-role-index="${index}">${escapeHtml(item.name)}</button>`).join('')}
            </div>
            <form data-bank-form>
              <div class="bank-role-fields">
                <label class="field"><span>职位名称</span><input name="role.name" value="${escapeHtml(role.name)}"></label>
                <label class="field"><span>岗位定位</span><textarea name="role.positioning" rows="2">${escapeHtml(role.positioning)}</textarea></label>
                <label class="field"><span>评估周期</span><input name="role.period" value="${escapeHtml(role.period)}"></label>
              </div>
              ${role.dimensions.map((dimension, dimIndex) => `
                <div class="bank-dimension">
                  <h2>维度 ${dimIndex + 1}</h2>
                  <div class="bank-dim-fields">
                    <label class="field"><span>维度名称</span><input name="dim.${dimIndex}.name" value="${escapeHtml(dimension.name)}"></label>
                    <label class="field"><span>维度说明</span><textarea name="dim.${dimIndex}.description" rows="2">${escapeHtml(dimension.description)}</textarea></label>
                  </div>
                  ${dimension.questions.map((question, questionIndex) => `
                    <div class="bank-question">
                      <div class="bank-question-head"><b>${questionIndex + 1}.</b><input name="dim.${dimIndex}.q.${questionIndex}.focus" value="${escapeHtml(question.focus)}"></div>
                      <textarea name="dim.${dimIndex}.q.${questionIndex}.prompt" rows="2">${escapeHtml(question.prompt)}</textarea>
                      <div class="bank-options">
                        ${CODES.map((code) => `<label class="bank-option"><span>${code}</span><input name="dim.${dimIndex}.q.${questionIndex}.${code}" value="${escapeHtml(question.options[code])}"></label>`).join('')}
                      </div>
                    </div>
                  `).join('')}
                </div>
              `).join('')}
              <div class="admin-actions">
                <button type="button" class="button secondary" data-bank-back>返回</button>
                <button type="submit" class="button primary" ${busy ? 'disabled' : ''}>${busy ? '保存中…' : '保存题库'}</button>
              </div>
            </form>
          </section>
        </main>
      </div>
    `
  }

  function readText(form: HTMLFormElement, name: string): string {
    const el = form.elements.namedItem(name)
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value.trim() : ''
  }

  function collectRole(form: HTMLFormElement, base: QuestionBankRole): QuestionBankRole {
    return {
      id: base.id,
      legacyCode: base.legacyCode,
      name: readText(form, 'role.name'),
      positioning: readText(form, 'role.positioning'),
      period: readText(form, 'role.period'),
      dimensions: base.dimensions.map((dimension, dimIndex) => ({
        id: dimension.id,
        name: readText(form, `dim.${dimIndex}.name`),
        category: dimension.category,
        description: readText(form, `dim.${dimIndex}.description`),
        questions: dimension.questions.map((question, questionIndex) => ({
          id: question.id,
          focus: readText(form, `dim.${dimIndex}.q.${questionIndex}.focus`),
          prompt: readText(form, `dim.${dimIndex}.q.${questionIndex}.prompt`),
          options: Object.fromEntries(CODES.map((code) => [code, readText(form, `dim.${dimIndex}.q.${questionIndex}.${code}`)])) as QuestionBankRole['dimensions'][number]['questions'][number]['options'],
        })),
      })),
    }
  }

  async function save(form: HTMLFormElement): Promise<void> {
    if (!bank) return
    const current = bank.roles[roleIndex]
    if (!current) return
    const collected = collectRole(form, current)
    busy = true
    notice = ''
    render()
    try {
      await options.api.saveQuestionBankRole(current.id, collected)
      bank = { ...bank, roles: bank.roles.map((role, index) => (index === roleIndex ? collected : role)) }
      notice = '题库已保存。'
    } catch (error) {
      notice = error instanceof Error ? error.message : '保存失败'
    } finally {
      busy = false
      render()
    }
  }

  host.addEventListener('submit', (event) => {
    const form = (event.target as Element).closest<HTMLFormElement>('form[data-bank-form]')
    if (!form) return
    event.preventDefault()
    void save(form)
  })

  host.addEventListener('click', (event) => {
    const target = (event.target as Element).closest<HTMLElement>('[data-bank-back], [data-bank-role-index]')
    if (!target) return
    if (target.dataset.bankBack !== undefined) {
      options.onBack()
      return
    }
    if (target.dataset.bankRoleIndex !== undefined) {
      roleIndex = Number(target.dataset.bankRoleIndex)
      notice = ''
      render()
    }
  })

  options.api.getQuestionBank().then((loaded) => {
    bank = loaded
    render()
  }).catch((error) => {
    notice = error instanceof Error ? error.message : '题库加载失败'
    host.innerHTML = `<section class="panel admin-panel"><div class="inline-warning">${escapeHtml(notice)}</div></section>`
  })
}
