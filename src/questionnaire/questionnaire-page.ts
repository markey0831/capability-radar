import { escapeHtml } from '../utils/html'
import { ApiError } from '../app/api-client'
import { renderAppShell } from '../app/app-shell'
import type { AnswerCode } from '../../shared/question-bank/schema'
import type { RaterLevel } from '../../shared/domain/types'
import { buildSubmissionAnswers, dimensionValidAnswerCounts, hasSubmittableDimension, setAnswer } from './questionnaire-flow'
import { DraftStore, questionnaireDraftKey } from './draft-store'
import type { QuestionnaireApi, QuestionnaireInfo, SubmitResult, TaskForm, VisibleTask } from './types'

type Step = 'loading' | 'identity' | 'tasks' | 'answering' | 'review' | 'success' | 'error'

interface PageState {
  step: Step
  info: QuestionnaireInfo | null
  name: string
  department: string
  tasks: VisibleTask[]
  form: TaskForm | null
  currentToken: string | null
  answers: Record<string, AnswerCode>
  dimensionIndex: number
  submitting: boolean
  idempotencyKey: string
  notice: string | null
  submitted: SubmitResult | null
}

const LEVEL_META: Record<RaterLevel, string> = {
  superior: '上级评分',
  peer: '平级评分',
  subordinate: '下级评分',
}

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error && error.message) return error.message
  return '操作失败，请稍后重试'
}

function deadlineText(deadlineAt: string): string {
  const date = new Date(deadlineAt)
  if (Number.isNaN(date.getTime())) return deadlineAt
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export class QuestionnairePage {
  private readonly root: HTMLElement
  private readonly api: QuestionnaireApi
  private readonly roleCode: string
  private readonly drafts: DraftStore
  private state: PageState

  constructor(root: HTMLElement, api: QuestionnaireApi, roleCode: string, drafts: DraftStore = new DraftStore()) {
    this.root = root
    this.api = api
    this.roleCode = roleCode
    this.drafts = drafts
    this.state = this.initialState()
    this.bindEvents()
  }

  mount(): void {
    this.render()
    void this.loadInfo()
  }

  private initialState(): PageState {
    return {
      step: 'loading',
      info: null,
      name: '',
      department: '',
      tasks: [],
      form: null,
      currentToken: null,
      answers: {},
      dimensionIndex: 0,
      submitting: false,
      idempotencyKey: '',
      notice: null,
      submitted: null,
    }
  }

  private async loadInfo(): Promise<void> {
    try {
      const info = await this.api.getQuestionnaire(this.roleCode)
      this.state.info = info
      if (!info.batch) {
        this.state.step = 'error'
        this.state.notice = '该职位当前没有开放的评估批次，请稍后再试。'
        this.render()
        return
      }
      this.state.step = 'identity'
      this.render()
    } catch (error) {
      this.state.step = 'error'
      this.state.notice = messageOf(error)
      this.render()
    }
  }

  private bindEvents(): void {
    this.root.addEventListener('submit', (event) => {
      const form = (event.target as Element).closest<HTMLFormElement>('form[data-form]')
      if (!form) return
      event.preventDefault()
      const kind = form.dataset.form
      if (kind === 'identity') void this.handleIdentity(form)
    })

    this.root.addEventListener('change', (event) => {
      const input = event.target as HTMLInputElement
      if (input.dataset.questionId) this.handleAnswerChange(input.dataset.questionId, input.value as AnswerCode)
    })

    this.root.addEventListener('click', (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>('[data-action]')
      if (!button) return
      const action = button.dataset.action
      if (action === 'open-task') void this.openTask(button.dataset.taskId ?? '')
      if (action === 'prev-dimension') this.moveDimension(-1)
      if (action === 'next-dimension') this.moveDimension(1)
      if (action === 'to-review') this.goToReview()
      if (action === 'submit-questionnaire') void this.submit()
      if (action === 'back-to-tasks') void this.backToTasks()
      if (action === 'reload') window.location.reload()
    })
  }

  private async handleIdentity(form: HTMLFormElement): Promise<void> {
    const data = new FormData(form)
    const name = String(data.get('name') ?? '').trim()
    const department = String(data.get('department') ?? '').trim()
    if (!name || !department) {
      this.state.notice = '请填写姓名和所在部门。'
      this.render()
      return
    }
    this.state.name = name
    this.state.department = department
    this.state.notice = null
    this.render()
    try {
      const result = await this.api.lookupTasks(this.roleCode, name, department)
      this.state.tasks = result.tasks
      this.state.step = 'tasks'
      this.state.notice = null
      this.render()
    } catch (error) {
      this.state.notice = messageOf(error)
      this.render()
    }
  }

  private async openTask(taskId: string): Promise<void> {
    const task = this.state.tasks.find((candidate) => candidate.taskId === taskId)
    if (!task || !task.token) return
    this.state.currentToken = task.token
    this.render()
    try {
      const form = await this.api.getTaskForm(task.token)
      const draft = this.drafts.load(questionnaireDraftKey(form.batch.id, form.task.id, form.questionnaireVersion))
      this.state.form = form
      this.state.answers = draft?.answers ?? {}
      this.state.dimensionIndex = draft?.dimensionIndex ?? 0
      this.state.step = 'answering'
      this.state.notice = null
      this.render()
    } catch (error) {
      this.state.notice = messageOf(error)
      this.render()
    }
  }

  private handleAnswerChange(questionId: string, answer: AnswerCode): void {
    this.state.answers = setAnswer(this.state.answers, questionId, answer)
    this.saveDraft()
    this.root.querySelectorAll<HTMLInputElement>('input[data-question-id]').forEach((input) => {
      if (input.dataset.questionId !== questionId) return
      const option = input.closest<HTMLElement>('.option')
      if (option) option.classList.toggle('selected', input.checked)
    })
    const progress = this.root.querySelector<HTMLElement>('[data-progress]')
    if (progress && this.state.form) {
      progress.textContent = `${this.answeredTotal()}/30`
    }
  }

  private answeredTotal(): number {
    return Object.keys(this.state.answers).length
  }

  private moveDimension(delta: number): void {
    if (!this.state.form) return
    const next = this.state.dimensionIndex + delta
    if (next < 0 || next >= this.state.form.role.dimensions.length) return
    this.state.dimensionIndex = next
    this.saveDraft()
    this.render()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  private goToReview(): void {
    if (!this.state.form) return
    this.state.step = 'review'
    this.saveDraft()
    this.render()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  private async submit(): Promise<void> {
    if (!this.state.form || !this.state.currentToken || this.state.submitting) return
    const role = this.state.form.role
    if (!hasSubmittableDimension(role, this.state.answers)) {
      this.state.notice = '至少需要一个维度有 3 道 A—E 有效答案才能提交。'
      this.render()
      return
    }
    const invalidDimensions = dimensionValidAnswerCounts(role, this.state.answers)
      .filter((count) => count < 3).length
    if (invalidDimensions > 0 && !window.confirm('仍有维度的有效答案不足 3 道，这些维度将按缺失处理。确定提交吗？')) {
      return
    }
    this.state.submitting = true
    this.state.notice = null
    if (!this.state.idempotencyKey) this.state.idempotencyKey = globalThis.crypto?.randomUUID?.() ?? `submit-${Date.now()}`
    this.render()
    try {
      const result = await this.api.submit({
        token: this.state.currentToken,
        idempotencyKey: this.state.idempotencyKey,
        answers: buildSubmissionAnswers(role, this.state.answers),
      })
      const form = this.state.form
      this.drafts.clear(questionnaireDraftKey(form.batch.id, form.task.id, form.questionnaireVersion))
      this.state.submitted = result
      this.state.step = 'success'
      this.state.submitting = false
      this.render()
    } catch (error) {
      this.state.submitting = false
      this.state.notice = messageOf(error)
      this.render()
    }
  }

  private async backToTasks(): Promise<void> {
    try {
      const result = await this.api.lookupTasks(this.roleCode, this.state.name, this.state.department)
      this.state.tasks = result.tasks
      this.state.form = null
      this.state.currentToken = null
      this.state.answers = {}
      this.state.dimensionIndex = 0
      this.state.submitted = null
      this.state.step = 'tasks'
      this.state.notice = null
      this.render()
    } catch (error) {
      this.state.notice = messageOf(error)
      this.render()
    }
  }

  private saveDraft(): void {
    if (!this.state.form) return
    this.drafts.save(
      questionnaireDraftKey(this.state.form.batch.id, this.state.form.task.id, this.state.form.questionnaireVersion),
      { answers: this.state.answers, dimensionIndex: this.state.dimensionIndex, savedAt: new Date().toISOString() },
    )
  }

  private render(): void {
    let content = ''
    if (this.state.step === 'loading') content = this.renderLoading()
    else if (this.state.step === 'identity') content = this.renderIdentity()
    else if (this.state.step === 'tasks') content = this.renderTasks()
    else if (this.state.step === 'answering') content = this.renderAnswering()
    else if (this.state.step === 'review') content = this.renderReview()
    else if (this.state.step === 'success') content = this.renderSuccess()
    else content = this.renderError()
    this.root.innerHTML = renderAppShell(content, { title: this.state.info?.role.name ?? '' })
  }

  private renderLoading(): string {
    return '<section class="panel route-placeholder"><p>正在加载问卷…</p></section>'
  }

  private renderIdentity(): string {
    const info = this.state.info
    if (!info?.batch) return this.renderError()
    return `<section class="panel questionnaire-panel">
      <div class="page-intro compact"><span class="section-kicker">ANONYMOUS FEEDBACK</span><h1>${escapeHtml(info.role.name)}岗位能力评估</h1><p>${escapeHtml(info.anonymityNotice)}</p></div>
      <div class="batch-meta"><span>批次：${escapeHtml(info.batch.name)}</span><span>截止：${escapeHtml(deadlineText(info.batch.deadlineAt))}</span></div>
      ${this.state.notice ? `<div class="inline-warning">${escapeHtml(this.state.notice)}</div>` : ''}
      <form data-form="identity" class="stack-form">
        <label class="field"><span>姓名 <em>*</em></span><input name="name" autocomplete="name" value="${escapeHtml(this.state.name)}" placeholder="请输入您的姓名"></label>
        <label class="field"><span>所在部门 <em>*</em></span><input name="department" value="${escapeHtml(this.state.department)}" placeholder="例如：数字业务部"></label>
        <button class="button primary" type="submit">查找我的评价任务 <span>→</span></button>
      </form>
    </section>`
  }

  private renderTasks(): string {
    return `<section class="panel questionnaire-panel">
      <div class="page-intro compact"><h1>请选择评价任务</h1><p>姓名与部门仅用于核对您的任务，匿名提交，不展示给被评估人。</p></div>
      ${this.state.notice ? `<div class="inline-warning">${escapeHtml(this.state.notice)}</div>` : ''}
      <div class="task-list">${this.state.tasks.map((task) => `
        <article class="task-card">
          <div><span class="level-chip">${escapeHtml(LEVEL_META[task.level])}</span><h2>${escapeHtml(task.evaluatee.name)} · ${escapeHtml(task.evaluatee.department)}</h2></div>
          <div class="task-actions">
            ${task.status === 'submitted'
              ? `<span class="task-done">已提交 ${task.submittedAt ? escapeHtml(deadlineText(task.submittedAt)) : ''}</span>`
              : `<button class="button primary small" type="button" data-action="open-task" data-task-id="${escapeHtml(task.taskId)}">开始评价</button>`}
          </div>
        </article>`).join('')}</div>
    </section>`
  }

  private renderAnswering(): string {
    const form = this.state.form
    if (!form) return this.renderError()
    const role = form.role
    const dimension = role.dimensions[this.state.dimensionIndex]
    if (!dimension) return this.renderError()
    const isLast = this.state.dimensionIndex === role.dimensions.length - 1
    const answered = this.answeredTotal()
    return `<section class="panel questionnaire-panel">
      <div class="questionnaire-header">
        <div><span class="section-kicker">${escapeHtml(role.name)} · 第 ${this.state.dimensionIndex + 1}/6 维</span><h1>${escapeHtml(dimension.name)}</h1><p>${escapeHtml(dimension.description)}</p></div>
        <span class="progress-chip"><b data-progress>${answered}/30</b><small>整体进度</small></span>
      </div>
      <div class="dimension-progress"><i style="width:${Math.round(((this.state.dimensionIndex + 1) / role.dimensions.length) * 100)}%"></i></div>
      <div class="question-list">${dimension.questions.map((question, index) => `
        <article class="question-item">
          <h2><span>${index + 1}</span>${escapeHtml(question.prompt)}</h2>
          <div class="option-list">${this.renderOptions(question.id, question.options, this.state.answers[question.id])}</div>
        </article>`).join('')}</div>
      <div class="sticky-actions">
        <button class="button ghost" type="button" data-action="prev-dimension" ${this.state.dimensionIndex === 0 ? 'disabled' : ''}>← 上一维</button>
        ${isLast
          ? '<button class="button primary" type="button" data-action="to-review">检查并提交 →</button>'
          : '<button class="button primary" type="button" data-action="next-dimension">下一维 →</button>'}
      </div>
    </section>`
  }

  private renderOptions(questionId: string, options: Record<Exclude<AnswerCode, 'UNABLE'>, string>, selected: AnswerCode | undefined): string {
    const codes: AnswerCode[] = ['A', 'B', 'C', 'D', 'E', 'UNABLE']
    return codes.map((code) => {
      const text = code === 'UNABLE' ? '无法判断（不计入有效题数）' : options[code as Exclude<AnswerCode, 'UNABLE'>]
      return `<label class="option ${selected === code ? 'selected' : ''}">
        <input type="radio" name="${escapeHtml(questionId)}" value="${code}" data-question-id="${escapeHtml(questionId)}" ${selected === code ? 'checked' : ''}>
        <span class="option-code">${escapeHtml(code)}</span>
        <span class="option-text">${escapeHtml(text)}</span>
      </label>`
    }).join('')
  }

  private renderReview(): string {
    const form = this.state.form
    if (!form) return this.renderError()
    const counts = dimensionValidAnswerCounts(form.role, this.state.answers)
    return `<section class="panel questionnaire-panel">
      <div class="page-intro compact"><h1>提交前检查</h1><p>确认有效答案数量，提交后将无法自行修改。</p></div>
      <div class="review-list">${form.role.dimensions.map((dimension, index) => {
        const valid = counts[index] ?? 0
        return `<div class="review-row"><span>${escapeHtml(dimension.name)}</span><b class="${valid >= 3 ? 'ok' : 'warn'}">${valid}/5 有效</b></div>`
      }).join('')}</div>
      ${this.state.notice ? `<div class="inline-warning">${escapeHtml(this.state.notice)}</div>` : ''}
      <div class="sticky-actions">
        <button class="button ghost" type="button" data-action="prev-dimension">← 返回修改</button>
        <button class="button primary" type="button" data-action="submit-questionnaire" ${this.state.submitting ? 'disabled' : ''}>${this.state.submitting ? '正在提交…' : '匿名提交'}</button>
      </div>
    </section>`
  }

  private renderSuccess(): string {
    const result = this.state.submitted
    return `<section class="panel questionnaire-panel success-panel">
      <div class="success-mark">✓</div>
      <h1>提交成功</h1>
      ${result ? `<p>已提交对 <b>${escapeHtml(result.evaluatee.name)}</b> 的 ${escapeHtml(result.role.name)}岗位评价。</p><p class="muted">提交时间：${escapeHtml(deadlineText(result.submittedAt))}</p>` : ''}
      <p>感谢您的反馈。您可以继续完成其他评价任务。</p>
      <button class="button primary" type="button" data-action="back-to-tasks">返回任务列表</button>
    </section>`
  }

  private renderError(): string {
    return `<section class="panel questionnaire-panel">
      <div class="inline-warning">${escapeHtml(this.state.notice ?? '加载失败，请稍后重试。')}</div>
      <button class="button secondary" type="button" data-action="reload">重新加载</button>
    </section>`
  }
}
