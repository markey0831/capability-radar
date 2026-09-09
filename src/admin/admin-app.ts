import { escapeHtml } from '../utils/html'
import { ApiError } from '../app/api-client'
import { SessionStore } from '../app/session-store'
import type { RaterLevel } from '../../shared/domain/types'
import { renderRadarCard } from '../chart/radar-chart'
import type { RadarCardData } from '../chart/radar-chart'
import { exportElementToPng, makePngFilename } from '../export/png-export'
import { exportElementsToPdf, makePdfFilename } from '../export/pdf-export'
import { ROLE_MODELS } from '../config/role-models'
import type { AdminApi, AdminBatch, AdminBatchDetails, AdminParticipant, AdminParticipantResult, AdminPerson, AdminRoleSummary, AdminSubmission } from './admin-api'
import { parsePersonImportFile } from './csv-import'
import { mountQuestionBankEditor } from './question-bank-editor'

type AdminView = 'loading' | 'login' | 'dashboard' | 'people' | 'batches' | 'batch' | 'result' | 'password' | 'bank'

interface AdminState {
  view: AdminView
  authenticated: boolean
  roles: AdminRoleSummary[]
  people: AdminPerson[]
  selectedPeople: Set<string>
  batches: AdminBatch[]
  selectedBatchId: string | null
  details: AdminBatchDetails | null
  submissions: AdminSubmission[]
  results: Record<string, AdminParticipantResult>
  selectedParticipant: AdminParticipant | null
  selectedResult: AdminParticipantResult | null
  notice: string | null
  busy: boolean
}

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error && error.message) return error.message
  return '操作失败，请稍后重试'
}

function roleName(roles: AdminRoleSummary[], roleId: string | null): string {
  return roles.find((role) => role.id === roleId)?.name ?? '—'
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function toDatetimeLocal(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (number: number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export interface AdminAppOptions {
  initialPath: string
  demoPassword?: string
  sessionStore?: SessionStore
}

export function createAdminApp(host: HTMLElement, api: AdminApi, options: AdminAppOptions): void {
  const sessionStore = options.sessionStore ?? new SessionStore()
  const state: AdminState = {
    view: initialView(options.initialPath),
    authenticated: false,
    roles: [],
    people: [],
    selectedPeople: new Set(),
    batches: [],
    selectedBatchId: null,
    details: null,
    submissions: [],
    results: {},
    selectedParticipant: null,
    selectedResult: null,
    notice: null,
    busy: false,
  }

  const render = (): void => {
    let content = ''
    if (state.view === 'loading') content = renderLoading()
    else if (state.view === 'login') content = renderLogin(options.demoPassword)
    else if (!state.authenticated) content = renderLogin(options.demoPassword)
    else if (state.view === 'dashboard') content = renderDashboard()
    else if (state.view === 'people') content = renderPeople()
    else if (state.view === 'batches') content = renderBatches()
    else if (state.view === 'result') content = renderResult()
    else if (state.view === 'password') content = renderChangePassword()
    else if (state.view === 'bank') {
      host.innerHTML = ''
      const bankHost = document.createElement('div')
      bankHost.className = 'bank-editor-host'
      host.appendChild(bankHost)
      mountQuestionBankEditor(bankHost, {
        api,
        onBack: () => void go('dashboard'),
      })
      return
    }
    else content = renderBatchDetail()
    host.innerHTML = content
  }

  const loadRoles = async (): Promise<void> => {
    state.roles = await api.listRoles()
  }

  const loadPeople = async (): Promise<void> => {
    state.people = await api.listPeople()
  }

  const loadBatches = async (): Promise<void> => {
    state.batches = await api.listBatches()
  }

  const setAuthenticated = (csrfToken: string): void => {
    state.authenticated = true
    state.busy = false
    sessionStore.setCsrfToken(csrfToken)
  }

  const clearAuthenticated = (): void => {
    state.authenticated = false
    state.view = 'login'
    sessionStore.clear()
  }

  const go = async (view: Exclude<AdminView, 'loading' | 'login'>): Promise<void> => {
    state.view = view
    state.notice = null
    render()
    try {
      await loadRoles()
      await loadPeople()
      await loadBatches()
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearAuthenticated()
      } else {
        state.notice = messageOf(error)
      }
    }
    render()
  }

  const openBatchDetail = async (batchId: string): Promise<void> => {
    state.selectedBatchId = batchId
    state.view = 'batch'
    state.notice = null
    state.details = null
    state.submissions = []
    state.results = {}
    render()
    try {
      state.details = await api.getBatchDetails(batchId)
      state.submissions = await api.listSubmissions(batchId)
      const results: Record<string, AdminParticipantResult> = {}
      for (const participant of state.details.participants.filter((candidate) => candidate.status === 'active')) {
        try {
          results[participant.id] = await api.getParticipantResult(batchId, participant.id)
        } catch {
          // 单个人员结果失败不阻断整个批次详情。
        }
      }
      state.results = results
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearAuthenticated()
      } else {
        state.notice = messageOf(error)
      }
    }
    render()
  }

  const viewResult = async (participantId: string): Promise<void> => {
    const participant = state.details?.participants.find((candidate) => candidate.id === participantId)
    if (!participant) return
    state.selectedParticipant = participant
    state.selectedResult = state.results[participantId] ?? null
    state.view = 'result'
    state.notice = null
    render()
    if (!state.selectedResult && state.selectedBatchId) {
      try {
        state.selectedResult = await api.getParticipantResult(state.selectedBatchId, participantId)
      } catch (error) {
        state.notice = messageOf(error)
      }
      render()
    }
  }

  const mount = async (): Promise<void> => {
    const requestedView: Exclude<AdminView, 'loading'> = state.view === 'loading' ? 'dashboard' : state.view
    state.view = 'loading'
    render()
    try {
      const session = await api.session()
      setAuthenticated(session.csrfToken)
      await go(requestedView === 'login' ? 'dashboard' : requestedView)
    } catch (error) {
      clearAuthenticated()
      render()
    }
  }

  function initialView(path: string): AdminView {
    if (path === '/admin/login') return 'login'
    if (path === '/admin/people') return 'people'
    if (path === '/admin/batches') return 'batches'
    return 'dashboard'
  }

  function renderLoading(): string {
    return '<section class="panel admin-panel"><p>正在加载…</p></section>'
  }

  function renderLogin(demoPassword?: string): string {
    return `<section class="panel admin-panel admin-login">
      <h1>管理员登录</h1>
      ${demoPassword ? `<p class="muted">本地演示密码：${escapeHtml(demoPassword)}</p>` : ''}
      ${state.notice ? `<div class="inline-warning">${escapeHtml(state.notice)}</div>` : ''}
      <form data-admin-form="login" class="stack-form">
        <label class="field"><span>管理密码</span><input type="password" name="password" autocomplete="current-password"></label>
        <button class="button primary" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? '登录中…' : '登录'}</button>
      </form>
    </section>`
  }

  function renderShell(content: string, active: Exclude<AdminView, 'loading' | 'login'>): string {
    return `<div class="admin-shell">
      <header class="site-header admin-header">
        <div class="admin-title">管理后台</div>
        <nav class="admin-nav">
          <button type="button" class="nav-button ${active === 'dashboard' ? 'active' : ''}" data-admin-view="dashboard">工作台</button>
          <button type="button" class="nav-button ${active === 'people' ? 'active' : ''}" data-admin-view="people">人员</button>
          <button type="button" class="nav-button ${active === 'batches' ? 'active' : ''}" data-admin-view="batches">批次</button>
          <button type="button" class="nav-button ${active === 'bank' ? 'active' : ''}" data-admin-view="bank">题库</button>
          <button type="button" class="nav-button ${active === 'password' ? 'active' : ''}" data-admin-view="password">修改密码</button>
          <button type="button" class="nav-button" data-admin-action="logout">退出</button>
        </nav>
      </header>
      <main class="route-main admin-main">${content}</main>
    </div>`
  }

  function renderChangePassword(): string {
    return renderShell(`<section class="panel admin-panel">
      <h1>修改密码</h1>
      ${state.notice ? `<div class="inline-warning">${escapeHtml(state.notice)}</div>` : ''}
      <form data-admin-form="change-password" class="stack-form">
        <label class="field"><span>当前密码</span><input type="password" name="currentPassword" autocomplete="current-password" required></label>
        <label class="field"><span>新密码（至少 12 位）</span><input type="password" name="newPassword" minlength="12" autocomplete="new-password" required></label>
        <label class="field"><span>确认新密码</span><input type="password" name="confirmPassword" minlength="12" autocomplete="new-password" required></label>
        <button class="button primary" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? '保存中…' : '保存'}</button>
      </form>
    </section>`, 'password')
  }

  function renderDashboard(): string {
    return renderShell(`<section class="panel admin-panel">
      <h1>工作台</h1>
      ${state.notice ? `<div class="inline-warning">${escapeHtml(state.notice)}</div>` : ''}
      <div class="stat-grid">
        <div class="stat-card"><b>${state.people.length}</b><span>人员</span></div>
        <div class="stat-card"><b>${state.batches.length}</b><span>批次</span></div>
        <div class="stat-card"><b>${state.roles.length}</b><span>职位</span></div>
      </div>
    </section>`, 'dashboard')
  }

  function renderPeople(): string {
    return renderShell(`<section class="panel admin-panel">
      <h1>人员名单</h1>
      ${state.notice ? `<div class="inline-warning">${escapeHtml(state.notice)}</div>` : ''}
      <form data-admin-form="person" class="admin-inline-form">
        <input name="name" placeholder="姓名" required>
        <input name="department" placeholder="部门" required>
        <select name="currentRoleId"><option value="">选择职位</option>${state.roles.map((role) => `<option value="${escapeHtml(role.id)}">${escapeHtml(role.name)}</option>`).join('')}</select>
        <label><input type="checkbox" name="canBeEvaluatee" checked>可被评</label>
        <label><input type="checkbox" name="canBeRater" checked>可评分</label>
        <button class="button primary small" type="submit">新增</button>
      </form>
      <div class="admin-actions">
        <button class="button small ghost" type="button" data-admin-action="toggle-select-people">全选</button>
        <button class="button small ghost" type="button" data-admin-action="batch-deactivate">批量停用</button>
        <button class="button small ghost" type="button" data-admin-action="batch-activate">批量启用</button>
        <button class="button small ghost danger-text" type="button" data-admin-action="batch-delete">批量删除</button>
        <label class="button small ghost">批量导入 Excel/CSV<input type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" data-admin-input="import-people" hidden></label>
      </div>
      <div class="admin-list">${state.people.map((person) => `<div class="admin-row"><label class="admin-row-select"><input type="checkbox" data-admin-check="person" data-person-id="${escapeHtml(person.id)}" ${state.selectedPeople.has(person.id) ? 'checked' : ''}></label><div><b>${escapeHtml(person.name)}</b><span>${escapeHtml(person.department)}</span></div><div>${escapeHtml(roleName(state.roles, person.currentRoleId))}</div><div class="muted">${person.status === 'active' ? '启用' : '停用'}</div><div class="admin-row-actions"><button class="button small ghost" type="button" data-admin-action="toggle-person-status" data-person-id="${escapeHtml(person.id)}" data-status="${person.status}">${person.status === 'active' ? '停用' : '启用'}</button><button class="button small ghost danger-text" type="button" data-admin-action="delete-person" data-person-id="${escapeHtml(person.id)}">删除</button></div></div>`).join('') || '<p class="muted">暂无人员</p>'}</div>
    </section>`, 'people')
  }

  function renderBatches(): string {
    return renderShell(`<section class="panel admin-panel">
      <h1>评估批次</h1>
      ${state.notice ? `<div class="inline-warning">${escapeHtml(state.notice)}</div>` : ''}
      <form data-admin-form="batch" class="admin-inline-form">
        <input name="name" placeholder="批次名称" required>
        <select name="roleId" required><option value="">选择职位</option>${state.roles.map((role) => `<option value="${escapeHtml(role.id)}">${escapeHtml(role.name)}</option>`).join('')}</select>
        <input name="assessmentDate" type="date" required>
        <input name="startsAt" type="datetime-local" required>
        <input name="deadlineAt" type="datetime-local" required>
        <button class="button primary small" type="submit">创建</button>
      </form>
      <div class="admin-list">${state.batches.map((batch) => `<button class="admin-row admin-row-button" type="button" data-admin-action="open-batch-detail" data-batch-id="${escapeHtml(batch.id)}"><div><b>${escapeHtml(batch.name)}</b><span>${escapeHtml(roleName(state.roles, batch.roleId))}</span></div><div class="muted">${escapeHtml(formatDateTime(batch.deadlineAt))}</div><div>${escapeHtml(batch.status)}</div></button>`).join('') || '<p class="muted">暂无批次</p>'}</div>
    </section>`, 'batches')
  }

  function renderBatchDetail(): string {
    const details = state.details
    if (!details) {
      return renderShell(`<section class="panel admin-panel"><p>正在加载批次…</p>${state.notice ? `<div class="inline-warning">${escapeHtml(state.notice)}</div>` : ''}</section>`, 'batches')
    }
    const batch = details.batch
    const peopleOptions = state.people.map((person) => `<option value="${escapeHtml(person.id)}">${escapeHtml(person.name)} · ${escapeHtml(person.department)}</option>`).join('')
    const participantOptions = details.participants
      .filter((participant) => participant.status === 'active')
      .map((participant) => `<option value="${escapeHtml(participant.id)}">${escapeHtml(participant.nameSnapshot)} · ${escapeHtml(participant.departmentSnapshot)}</option>`).join('')

    return renderShell(`<section class="panel admin-panel">
      <h1>${escapeHtml(batch.name)}</h1>
      <div class="batch-meta"><span>职位：${escapeHtml(roleName(state.roles, batch.roleId))}</span><span>状态：${escapeHtml(batch.status)}</span><span>截止：${escapeHtml(formatDateTime(batch.deadlineAt))}</span></div>
      ${state.notice ? `<div class="inline-warning">${escapeHtml(state.notice)}</div>` : ''}
      <div class="admin-actions">
        ${batch.status === 'draft' ? '<button class="button primary" type="button" data-admin-action="open-batch">开放批次</button>' : ''}
        ${batch.status === 'open' ? '<button class="button secondary" type="button" data-admin-action="close-batch">关闭批次</button>' : ''}
        ${batch.status === 'open' ? `<span class="extend-form"><input type="datetime-local" data-admin-input="extend-deadline" value="${escapeHtml(toDatetimeLocal(batch.deadlineAt))}"><button class="button ghost" type="button" data-admin-action="extend-batch">确认延长</button></span>` : ''}
        ${batch.status === 'closed' ? '<button class="button secondary" type="button" data-admin-action="reopen-batch">重新开放</button>' : ''}
        ${batch.status === 'closed' ? '<button class="button ghost" type="button" data-admin-action="archive-batch">归档</button>' : ''}
        <button class="button ghost" type="button" data-admin-action="copy-batch">复制批次</button>
        <button class="button secondary" type="button" data-admin-action="export-batch">导出 Excel/CSV</button>
      </div>
      <h2>被评估人</h2>
      <form data-admin-form="participant" class="admin-inline-form">
        <input type="hidden" name="batchId" value="${escapeHtml(batch.id)}">
        <select name="personId" required><option value="">选择人员</option>${peopleOptions}</select>
        <button class="button primary small" type="submit">添加被评估人</button>
      </form>
      <div class="admin-list">${details.participants.map((participant) => `<div class="admin-row"><div><b>${escapeHtml(participant.nameSnapshot)}</b><span>${escapeHtml(participant.departmentSnapshot)}</span></div><div class="muted">${participant.status === 'active' ? '有效' : '已移除'}</div></div>`).join('') || '<p class="muted">暂无被评估人</p>'}</div>
      <h2>评分任务</h2>
      <form data-admin-form="assignment" class="admin-inline-form">
        <input type="hidden" name="batchId" value="${escapeHtml(batch.id)}">
        <select name="participantId" required><option value="">选择被评估人</option>${participantOptions}</select>
        <select name="raterPersonId" required><option value="">选择评分人</option>${peopleOptions}</select>
        <select name="level" required><option value="superior">上级</option><option value="peer">平级</option><option value="subordinate">下级</option></select>
        <button class="button primary small" type="submit">添加任务</button>
      </form>
      <div class="admin-list">${details.assignments.map((assignment) => `<div class="admin-row"><div><b>${escapeHtml(assignment.raterNameSnapshot)}</b><span>${escapeHtml(assignment.raterDepartmentSnapshot)}</span></div><div>${escapeHtml(assignment.level)}</div><div class="muted">${escapeHtml(assignment.status)}</div></div>`).join('') || '<p class="muted">暂无评分任务</p>'}</div>
      <h2>答卷</h2>
      <div class="admin-list">${state.submissions.map((submission) => {
        const assignment = details.assignments.find((candidate) => candidate.id === submission.assignmentId)
        return `<div class="admin-row"><div><b>${escapeHtml(assignment?.raterNameSnapshot ?? '')}</b><span>${escapeHtml(formatDateTime(submission.submittedAt))}</span></div><div class="muted">${submission.status === 'active' ? '有效' : '作废'}</div>${submission.status === 'active' ? '<button class="button small ghost danger-text" type="button" data-admin-action="void-submission" data-submission-id="' + escapeHtml(submission.id) + '">作废</button>' : ''}</div>`
      }).join('') || '<p class="muted">暂无答卷</p>'}</div>
      <h2>结果汇总</h2>
      <div class="admin-list">${details.participants.filter((participant) => participant.status === 'active').map((participant) => {
        const result = state.results[participant.id]
        if (!result) return `<div class="admin-row"><div><b>${escapeHtml(participant.nameSnapshot)}</b><span>${escapeHtml(participant.departmentSnapshot)}</span></div><div class="muted">暂无结果</div><button class="button small ghost" type="button" data-admin-action="view-result" data-participant-id="${escapeHtml(participant.id)}">查看</button></div>`
        const dimensions = result.dimensions.map((dimension) => `${escapeHtml(dimension.name)} ${dimension.fivePointScore === null ? '待补充' : dimension.fivePointScore.toFixed(2)}`).join(' · ')
        return `<div class="admin-row"><div><b>${escapeHtml(participant.nameSnapshot)}</b><span>${escapeHtml(participant.departmentSnapshot)}</span></div><div><b>${result.overallFivePointScore === null ? '待补充' : result.overallFivePointScore.toFixed(2)}</b><span class="muted">${dimensions}</span></div><button class="button small ghost" type="button" data-admin-action="view-result" data-participant-id="${escapeHtml(participant.id)}">查看</button></div>`
      }).join('') || '<p class="muted">暂无被评估人</p>'}</div>
    </section>`, 'batches')
  }

  function renderResult(): string {
    const participant = state.selectedParticipant
    const result = state.selectedResult
    const batch = state.details?.batch
    if (!participant || !batch) {
      return renderShell('<section class="panel admin-panel"><p>暂无结果</p></section>', 'batches')
    }
    const roleNameText = roleName(state.roles, batch.roleId)
    const roleTitleEn = ROLE_MODELS.find((role) => role.id === batch.roleId)?.titleEn ?? roleNameText.toUpperCase()
    const noticeHtml = state.notice ? `<div class="inline-warning">${escapeHtml(state.notice)}</div>` : ''

    let body = ''
    if (result?.isComplete) {
      const cardData: RadarCardData = {
        name: participant.nameSnapshot,
        department: participant.departmentSnapshot,
        roleName: roleNameText,
        roleTitleEn,
        assessmentDate: batch.assessmentDate,
        dimensions: result.dimensions.map((dimension) => ({ dimensionId: dimension.dimensionId, name: dimension.name, score: dimension.fivePointScore ?? 0 })),
        overallAverage: result.overallFivePointScore ?? 0,
      }
      body = `<div class="radar-card-scroll">${renderRadarCard(cardData, null, 'admin-result')}</div>
        <div class="admin-actions">
          <button class="button primary" type="button" data-admin-action="export-png">导出 PNG</button>
          <button class="button secondary" type="button" data-admin-action="export-pdf">导出 PDF</button>
          <button class="button ghost" type="button" data-admin-action="back-to-batch">返回批次</button>
        </div>
        <div class="result-details" data-pdf-details>${renderResultDetails(result)}</div>`
    } else {
      const dimensions = result?.dimensions.map((dimension) => `<div class="admin-row"><div><b>${escapeHtml(dimension.name)}</b></div><div>${dimension.fivePointScore === null ? '待补充' : dimension.fivePointScore.toFixed(2)}</div></div>`).join('') ?? ''
      body = `<p class="muted">六维数据尚未完整，暂不生成雷达图。</p><div class="admin-list">${dimensions}</div>
        <div class="admin-actions"><button class="button ghost" type="button" data-admin-action="back-to-batch">返回批次</button></div>`
    }

    return renderShell(`<section class="panel admin-panel">
      <h1>${escapeHtml(participant.nameSnapshot)} · ${escapeHtml(roleNameText)}能力结果</h1>
      ${noticeHtml}
      ${body}
    </section>`, 'batches')
  }

  function renderResultDetails(result: AdminParticipantResult): string {
    const rows = result.dimensions.map((dimension) => `<tr><th>${escapeHtml(dimension.name)}</th><td>${dimension.fivePointScore === null ? '待补充' : dimension.fivePointScore.toFixed(2)}</td><td>${dimension.validRaterCount}</td></tr>`).join('')
    return `<h2>六维明细</h2>
      <div class="comparison-table-wrap"><table class="comparison-table"><thead><tr><th>维度</th><th>五分制得分</th><th>有效评分人数</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="muted">上级/平级/下级答卷数：${result.submittedRaterCounts.superior}/${result.submittedRaterCounts.peer}/${result.submittedRaterCounts.subordinate}</p>
      <p class="muted">计分说明：A—E 对应 1—5 分；单维至少 3 道 A—E 有效题；同层先均分，再按上级 50%、平级 30%、下级 20% 加权并归一。</p>`
  }

  host.addEventListener('submit', (event) => {
    const form = (event.target as Element).closest<HTMLFormElement>('form[data-admin-form]')
    if (!form) return
    event.preventDefault()
    const kind = form.dataset.adminForm
    if (kind === 'login') void submitLogin(form)
    if (kind === 'change-password') void submitChangePassword(form)
    if (kind === 'person') void submitPerson(form)
    if (kind === 'batch') void submitBatch(form)
    if (kind === 'participant') void submitParticipant(form)
    if (kind === 'assignment') void submitAssignment(form)
  })

  host.addEventListener('click', (event) => {
    const target = (event.target as Element).closest<HTMLElement>('[data-admin-view], [data-admin-action]')
    if (!target) return
    if (target.dataset.adminView) void go(target.dataset.adminView as Exclude<AdminView, 'loading' | 'login'>)
    if (target.dataset.adminAction === 'logout') void logout()
    if (target.dataset.adminAction === 'open-batch-detail') void openBatchDetail(target.dataset.batchId ?? '')
    if (target.dataset.adminAction === 'open-batch') void openCurrentBatch()
    if (target.dataset.adminAction === 'export-batch') void exportCurrentBatch()
    if (target.dataset.adminAction === 'close-batch') void closeCurrentBatch()
    if (target.dataset.adminAction === 'reopen-batch') void reopenCurrentBatch()
    if (target.dataset.adminAction === 'void-submission') void voidSubmission(target.dataset.submissionId ?? '')
    if (target.dataset.adminAction === 'extend-batch') void extendCurrentBatch()
    if (target.dataset.adminAction === 'archive-batch') void archiveCurrentBatch()
    if (target.dataset.adminAction === 'copy-batch') void copyCurrentBatch()
    if (target.dataset.adminAction === 'view-result') void viewResult(target.dataset.participantId ?? '')
    if (target.dataset.adminAction === 'export-png') void exportPng()
    if (target.dataset.adminAction === 'export-pdf') void exportPdf()
    if (target.dataset.adminAction === 'back-to-batch') void backToBatch()
    if (target.dataset.adminAction === 'toggle-select-people') toggleSelectPeople()
    if (target.dataset.adminAction === 'batch-deactivate') void batchSetStatus('inactive')
    if (target.dataset.adminAction === 'batch-activate') void batchSetStatus('active')
    if (target.dataset.adminAction === 'batch-delete') void batchDeletePeople()
    if (target.dataset.adminAction === 'toggle-person-status') void togglePersonStatus(target.dataset.personId ?? '', target.dataset.status === 'active' ? 'inactive' : 'active')
    if (target.dataset.adminAction === 'delete-person') void deleteSinglePerson(target.dataset.personId ?? '')
  })

  host.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement
    if (input.dataset.adminInput === 'import-people') void importPeopleFromFile(input)
    if (input.dataset.adminCheck === 'person') updatePersonSelection(input)
  })

  async function submitLogin(form: HTMLFormElement): Promise<void> {
    const password = String(new FormData(form).get('password') ?? '')
    state.busy = true
    state.notice = null
    render()
    try {
      const result = await api.login(password)
      setAuthenticated(result.csrfToken)
      await go('dashboard')
    } catch (error) {
      state.busy = false
      state.notice = messageOf(error)
      render()
    }
  }

  async function submitChangePassword(form: HTMLFormElement): Promise<void> {
    const data = new FormData(form)
    const currentPassword = String(data.get('currentPassword') ?? '')
    const newPassword = String(data.get('newPassword') ?? '')
    const confirmPassword = String(data.get('confirmPassword') ?? '')
    if (newPassword !== confirmPassword) {
      state.notice = '两次输入的新密码不一致'
      render()
      return
    }
    if (newPassword.length < 12) {
      state.notice = '新密码至少需要12个字符'
      render()
      return
    }
    state.busy = true
    state.notice = null
    render()
    try {
      await api.changePassword(currentPassword, newPassword)
      state.busy = false
      state.notice = '密码修改成功，下次登录请使用新密码。'
      render()
    } catch (error) {
      state.busy = false
      state.notice = messageOf(error)
      render()
    }
  }

  async function submitPerson(form: HTMLFormElement): Promise<void> {
    const data = new FormData(form)
    try {
      await api.createPerson({
        name: String(data.get('name') ?? ''),
        department: String(data.get('department') ?? ''),
        currentRoleId: data.get('currentRoleId') ? String(data.get('currentRoleId')) : null,
        canBeEvaluatee: data.get('canBeEvaluatee') === 'on',
        canBeRater: data.get('canBeRater') === 'on',
      })
      await go('people')
    } catch (error) {
      state.notice = messageOf(error)
      render()
    }
  }

  async function submitBatch(form: HTMLFormElement): Promise<void> {
    const data = new FormData(form)
    const startsAt = String(data.get('startsAt') ?? '')
    const deadlineAt = String(data.get('deadlineAt') ?? '')
    try {
      await api.createBatch({
        name: String(data.get('name') ?? ''),
        roleId: String(data.get('roleId') ?? ''),
        assessmentDate: String(data.get('assessmentDate') ?? ''),
        startsAt: new Date(startsAt).toISOString(),
        deadlineAt: new Date(deadlineAt).toISOString(),
      })
      await go('batches')
    } catch (error) {
      state.notice = messageOf(error)
      render()
    }
  }

  async function submitParticipant(form: HTMLFormElement): Promise<void> {
    const data = new FormData(form)
    const batchId = String(data.get('batchId') ?? '')
    try {
      await api.addParticipant(batchId, String(data.get('personId') ?? ''))
      await openBatchDetail(batchId)
    } catch (error) {
      state.notice = messageOf(error)
      render()
    }
  }

  async function submitAssignment(form: HTMLFormElement): Promise<void> {
    const data = new FormData(form)
    const batchId = String(data.get('batchId') ?? '')
    try {
      await api.addAssignment(
        batchId,
        String(data.get('participantId') ?? ''),
        String(data.get('raterPersonId') ?? ''),
        String(data.get('level') ?? 'superior') as RaterLevel,
      )
      await openBatchDetail(batchId)
    } catch (error) {
      state.notice = messageOf(error)
      render()
    }
  }

  async function importPeopleFromFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0]
    if (!file) return
    const rows = parsePersonImportFile(await file.arrayBuffer(), file.name)
    if (rows.length === 0) {
      state.notice = '未解析到有效数据行。'
      render()
      return
    }
    state.busy = true
    state.notice = `正在导入 ${rows.length} 条人员数据，请稍候...`
    render()
    try {
      const result = await api.importPeople(rows)
      await go('people')
      state.notice = `导入完成：成功 ${result.imported} 条${result.errors.length ? `，失败 ${result.errors.length} 条（首条：第 ${result.errors[0].row} 行 ${result.errors[0].message}）` : ''}`
      render()
    } catch (error) {
      state.notice = messageOf(error)
      render()
    } finally {
      state.busy = false
      input.value = ''
    }
  }

  function toggleSelectPeople(): void {
    if (state.selectedPeople.size === state.people.length && state.people.length > 0) {
      state.selectedPeople = new Set()
    } else {
      state.selectedPeople = new Set(state.people.map((person) => person.id))
    }
    render()
  }

  function updatePersonSelection(input: HTMLInputElement): void {
    const personId = input.dataset.personId
    if (!personId) return
    const next = new Set(state.selectedPeople)
    if (input.checked) next.add(personId)
    else next.delete(personId)
    state.selectedPeople = next
  }

  async function togglePersonStatus(personId: string, status: 'active' | 'inactive'): Promise<void> {
    const person = state.people.find((candidate) => candidate.id === personId)
    if (!person) return
    try {
      await api.updatePerson(person, status)
      state.notice = `已${status === 'active' ? '启用' : '停用'} ${person.name}。`
      await loadPeople()
      render()
    } catch (error) {
      state.notice = messageOf(error)
      render()
    }
  }

  async function batchSetStatus(status: 'active' | 'inactive'): Promise<void> {
    const selected = state.people.filter((person) => state.selectedPeople.has(person.id))
    if (selected.length === 0) {
      state.notice = '请先选择人员。'
      render()
      return
    }
    try {
      for (const person of selected) await api.updatePerson(person, status)
      state.selectedPeople = new Set()
      state.notice = `已${status === 'active' ? '启用' : '停用'} ${selected.length} 人。`
      await loadPeople()
      render()
    } catch (error) {
      state.notice = messageOf(error)
      render()
    }
  }

  async function deleteSinglePerson(personId: string): Promise<void> {
    const person = state.people.find((candidate) => candidate.id === personId)
    if (!person) return
    if (!window.confirm(`确定删除“${person.name}”吗？该操作不可恢复，且仅未被批次引用的人员可删除。`)) return
    try {
      const result = await api.deletePerson(personId)
      state.notice = result.deleted ? `已删除 ${person.name}。` : (result.message ?? '该人员无法删除。')
      await loadPeople()
      render()
    } catch (error) {
      state.notice = messageOf(error)
      render()
    }
  }

  async function batchDeletePeople(): Promise<void> {
    const selected = state.people.filter((person) => state.selectedPeople.has(person.id))
    if (selected.length === 0) {
      state.notice = '请先选择人员。'
      render()
      return
    }
    if (!window.confirm(`确定删除选中的 ${selected.length} 人吗？仅未被批次引用的人员会被删除。`)) return
    let deleted = 0
    const messages: string[] = []
    for (const person of selected) {
      try {
        const result = await api.deletePerson(person.id)
        if (result.deleted) deleted += 1
        else if (result.message) messages.push(`${person.name}：${result.message}`)
      } catch (error) {
        messages.push(`${person.name}：${messageOf(error)}`)
      }
    }
    state.selectedPeople = new Set()
    state.notice = `已删除 ${deleted} 人${messages.length ? `；${messages.join('；')}` : ''}`
    await loadPeople()
    render()
  }

  async function openCurrentBatch(): Promise<void> {
    if (!state.selectedBatchId) return
    try {
      await api.openBatch(state.selectedBatchId)
      await openBatchDetail(state.selectedBatchId)
    } catch (error) {
      state.notice = messageOf(error)
      render()
    }
  }

  async function closeCurrentBatch(): Promise<void> {
    if (!state.selectedBatchId) return
    if (!window.confirm('关闭批次后答卷和结果将冻结，确定关闭吗？')) return
    try {
      await api.closeBatch(state.selectedBatchId)
      await openBatchDetail(state.selectedBatchId)
    } catch (error) {
      state.notice = messageOf(error)
      render()
    }
  }

  async function reopenCurrentBatch(): Promise<void> {
    if (!state.selectedBatchId) return
    try {
      await api.reopenBatch(state.selectedBatchId)
      await openBatchDetail(state.selectedBatchId)
    } catch (error) {
      state.notice = messageOf(error)
      render()
    }
  }

  async function extendCurrentBatch(): Promise<void> {
    if (!state.selectedBatchId || !state.details) return
    const input = host.querySelector<HTMLInputElement>('[data-admin-input="extend-deadline"]')
    const next = input?.value
    if (!next) {
      state.notice = '请先选择新的截止时间。'
      render()
      return
    }
    try {
      await api.extendBatch(state.selectedBatchId, new Date(next).toISOString())
      await openBatchDetail(state.selectedBatchId)
    } catch (error) {
      state.notice = messageOf(error)
      render()
    }
  }

  async function archiveCurrentBatch(): Promise<void> {
    if (!state.selectedBatchId) return
    if (!window.confirm('归档后批次只读，确定归档吗？')) return
    try {
      await api.archiveBatch(state.selectedBatchId)
      await openBatchDetail(state.selectedBatchId)
    } catch (error) {
      state.notice = messageOf(error)
      render()
    }
  }

  async function copyCurrentBatch(): Promise<void> {
    if (!state.selectedBatchId || !state.details) return
    const source = state.details.batch
    const name = window.prompt('新批次名称', `${source.name} 副本`)
    if (!name) return
    try {
      await api.copyBatch(state.selectedBatchId, {
        name,
        assessmentDate: source.assessmentDate,
        startsAt: source.startsAt,
        deadlineAt: source.deadlineAt,
      })
      state.notice = '已复制为新草稿批次。'
      state.view = 'batches'
      await go('batches')
    } catch (error) {
      state.notice = messageOf(error)
      render()
    }
  }

  async function voidSubmission(submissionId: string): Promise<void> {
    const reason = window.prompt('请填写作废原因（2—500字）：')
    if (!reason) return
    try {
      await api.voidSubmission(submissionId, reason)
      if (state.selectedBatchId) await openBatchDetail(state.selectedBatchId)
    } catch (error) {
      state.notice = messageOf(error)
      render()
    }
  }

  async function exportPng(): Promise<void> {
    const participant = state.selectedParticipant
    const batch = state.details?.batch
    const result = state.selectedResult
    const card = host.querySelector<HTMLElement>('[data-export-card]')
    if (!participant || !batch || !result || !card) return
    const roleNameText = roleName(state.roles, batch.roleId)
    try {
      await exportElementToPng(card, makePngFilename(participant.nameSnapshot, roleNameText, batch.assessmentDate))
      state.notice = 'PNG 已开始下载。'
      render()
    } catch {
      state.notice = 'PNG 生成失败，请稍后重试。'
      render()
    }
  }

  async function exportPdf(): Promise<void> {
    const participant = state.selectedParticipant
    const batch = state.details?.batch
    if (!participant || !batch) return
    const pages = [host.querySelector<HTMLElement>('[data-export-card]'), host.querySelector<HTMLElement>('[data-pdf-details]')].filter((element): element is HTMLElement => element !== null)
    if (pages.length !== 2) {
      state.notice = 'PDF 内容尚未准备好。'
      render()
      return
    }
    try {
      await exportElementsToPdf(pages, makePdfFilename(participant.nameSnapshot, roleName(state.roles, batch.roleId), batch.assessmentDate))
      state.notice = 'PDF 已开始下载。'
      render()
    } catch {
      state.notice = 'PDF 生成失败，请稍后重试。'
      render()
    }
  }

  function backToBatch(): void {
    if (!state.selectedBatchId) return
    state.view = 'batch'
    state.selectedParticipant = null
    state.selectedResult = null
    void openBatchDetail(state.selectedBatchId)
  }

  async function exportCurrentBatch(): Promise<void> {
    if (!state.selectedBatchId) return
    try {
      const file = await api.exportBatch(state.selectedBatchId)
      downloadFile(file)
      state.notice = '导出已开始。'
      render()
    } catch (error) {
      state.notice = messageOf(error)
      render()
    }
  }

  function downloadFile(file: { filename: string; contentType: string; data: string }): void {
    const binary = atob(file.data)
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    const blob = new Blob([bytes], { type: file.contentType })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = file.filename
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function logout(): Promise<void> {
    try {
      await api.logout()
    } catch {
      // 即使服务端撤销失败，本地也退出。
    }
    clearAuthenticated()
    window.location.hash = '/'
  }

  void mount()
}
