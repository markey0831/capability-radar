import { renderComparisonTable, renderRadarCard, resultToCardData, savedToCardData } from '../chart/radar-chart'
import { getRoleModel, ROLE_MODELS } from '../config/role-models'
import { calculateAssessment, classifyRater, formatScore } from '../domain/score-engine'
import { RATER_LEVELS } from '../domain/types'
import type { AssessmentDraft, AssessmentResult, RaterInput, RaterLevel, RoleId, SavedAssessmentV1 } from '../domain/types'
import { exportElementToPng, makePngFilename } from '../export/png-export'
import { createSavedAssessment, deleteRecord, findPreviousCompatibleRecord, loadHistory, saveRecord, sortHistory } from '../storage/history-store'
import { escapeHtml } from '../utils/html'

const PRIVACY_KEY = 'capability-radar:privacy-acknowledged'
const LEVEL_META: Record<RaterLevel, { name: string; description: string; weight: string }> = {
  superior: { name: '上级评分', description: '主管、负责人等直接管理者', weight: '基础权重 50%' },
  peer: { name: '平级评分', description: '合作密切的同事或项目伙伴', weight: '基础权重 30%' },
  subordinate: { name: '下级评分', description: '被管理或被指导的团队成员', weight: '基础权重 20%' },
}

type AppView = 'assessment' | 'history'
type Notice = { kind: 'success' | 'warning' | 'error'; text: string } | null

interface AppState {
  view: AppView
  step: 1 | 2 | 3
  draft: AssessmentDraft
  result: AssessmentResult | null
  previous: SavedAssessmentV1 | null
  historyDetailId: string | null
  fieldErrors: Record<string, string>
  notice: Notice
}

let idCounter = 0

function todayLocal(): string {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

function makeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `rater-${Date.now()}-${++idCounter}`
}

function emptyRater(roleId: RoleId): RaterInput {
  return {
    id: makeId(),
    name: '',
    scores: Object.fromEntries(getRoleModel(roleId).dimensions.map((dimension) => [dimension.id, ''])),
  }
}

function createDraft(roleId: RoleId | '' = ''): AssessmentDraft {
  const raters: AssessmentDraft['raters'] = { superior: [], peer: [], subordinate: [] }
  if (roleId) {
    raters.superior.push(emptyRater(roleId))
    raters.peer.push(emptyRater(roleId))
  }
  return {
    person: { name: '', department: '', roleId, assessmentDate: todayLocal() },
    raters,
  }
}

function getBrowserStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function loadRecords(): { records: SavedAssessmentV1[]; corrupt: boolean } {
  const storage = getBrowserStorage()
  if (!storage) return { records: [], corrupt: true }
  const loaded = loadHistory(storage)
  return { records: sortHistory(loaded.records), corrupt: loaded.status === 'corrupt' }
}

function hasEnteredScores(draft: AssessmentDraft): boolean {
  return RATER_LEVELS.some((level) => draft.raters[level].some((rater) => Object.values(rater.scores).some((value) => value.trim())))
}

function roleOptions(selected: RoleId | ''): string {
  return `<option value="">请选择职位</option>${ROLE_MODELS.map((role) => `<option value="${role.id}" ${role.id === selected ? 'selected' : ''}>${escapeHtml(role.name)}</option>`).join('')}`
}

function renderShell(content: string, state: AppState): string {
  return `<div class="app-shell">
    <header class="site-header">
      <button class="brand" type="button" data-action="new-assessment" aria-label="返回新评估">
        <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>
        <span><b>能力图谱</b><small>ROLE CAPABILITY RADAR</small></span>
      </button>
      <nav aria-label="主导航">
        <button type="button" class="nav-button ${state.view === 'assessment' ? 'active' : ''}" data-action="show-assessment">开始评估</button>
        <button type="button" class="nav-button ${state.view === 'history' ? 'active' : ''}" data-action="show-history">历史记录</button>
      </nav>
    </header>
    ${state.notice ? `<div class="notice notice-${state.notice.kind}" role="status"><span>${escapeHtml(state.notice.text)}</span><button type="button" data-action="dismiss-notice" aria-label="关闭提示">×</button></div>` : ''}
    <main>${content}</main>
    <footer class="site-footer"><span>数据仅在您确认后保存在当前浏览器，本应用不会上传个人评估信息。</span><span>评分范围 0–100 · 结果换算为 5 分制</span></footer>
  </div>`
}

function renderStepBar(current: number): string {
  const steps = ['基础信息', '多人评分', '生成结果']
  return `<div class="step-bar" aria-label="评估进度">${steps.map((name, index) => {
    const number = index + 1
    const stepState = number < current ? 'done' : number === current ? 'current' : ''
    return `<div class="step ${stepState}"><span>${number < current ? '✓' : number}</span><b>${name}</b></div>${number < 3 ? '<i></i>' : ''}`
  }).join('')}</div>`
}

function fieldError(state: AppState, path: string): string {
  return state.fieldErrors[path] ? `<small class="field-error">${escapeHtml(state.fieldErrors[path])}</small>` : ''
}

function renderBasicInfo(state: AppState): string {
  const { person } = state.draft
  const role = person.roleId ? getRoleModel(person.roleId) : null
  return `<section class="page-section narrow-section">
    <div class="page-intro"><span class="section-kicker">STEP 01</span><h1>先认识一下被评估人</h1><p>这些信息会展示在最终能力图中，并用于匹配同一个人的历史记录。</p></div>
    ${renderStepBar(1)}
    <div class="panel form-panel">
      <div class="panel-heading"><div class="heading-icon">01</div><div><h2>基础信息</h2><p>请填写姓名、部门、职位和本次评估日期</p></div></div>
      <div class="form-grid">
        <label class="field"><span>姓名 <em>*</em></span><input autocomplete="name" data-person-field="name" value="${escapeHtml(person.name)}" placeholder="请输入被评估人姓名">${fieldError(state, 'person.name')}</label>
        <label class="field"><span>部门 <em>*</em></span><input data-person-field="department" value="${escapeHtml(person.department)}" placeholder="例如：数字业务部">${fieldError(state, 'person.department')}</label>
        <label class="field"><span>职位 <em>*</em></span><select data-person-field="roleId">${roleOptions(person.roleId)}</select>${fieldError(state, 'person.roleId')}</label>
        <label class="field"><span>评估日期 <em>*</em></span><input type="date" max="${todayLocal()}" data-person-field="assessmentDate" value="${escapeHtml(person.assessmentDate)}">${fieldError(state, 'person.assessmentDate')}</label>
      </div>
      ${role ? `<div class="role-preview"><div><span>当前模型</span><b>${escapeHtml(role.name)} · 六维能力</b><small>${escapeHtml(role.titleEn)}</small></div><ol>${role.dimensions.map((dimension) => `<li><b>${escapeHtml(dimension.name)}</b><span>${escapeHtml(dimension.description)}</span></li>`).join('')}</ol></div>` : '<div class="role-empty">选择职位后，这里会展示对应的六项能力维度。</div>'}
      <div class="panel-actions end"><button class="button primary" type="button" data-action="go-scoring">下一步：开始评分 <span>→</span></button></div>
    </div>
  </section>`
}

function renderRaterCard(rater: RaterInput, level: RaterLevel, index: number, roleId: RoleId): string {
  const role = getRoleModel(roleId)
  return `<article class="rater-card" data-rater-card="${rater.id}">
    <div class="rater-title"><div><span class="rater-number">${String(index + 1).padStart(2, '0')}</span><label>评分人姓名（选填）<input data-rater-name data-level="${level}" data-rater-id="${rater.id}" value="${escapeHtml(rater.name)}" placeholder="评分人 ${index + 1}"></label></div><button class="icon-button danger" type="button" data-action="remove-rater" data-level="${level}" data-rater-id="${rater.id}" aria-label="删除评分人">删除</button></div>
    <div class="score-grid">${role.dimensions.map((dimension, dimensionIndex) => `<label class="score-field" title="${escapeHtml(dimension.description)}"><span><i>${dimensionIndex + 1}</i>${escapeHtml(dimension.name)}</span><div><input inputmode="decimal" autocomplete="off" data-score data-level="${level}" data-rater-id="${rater.id}" data-dimension-id="${dimension.id}" value="${escapeHtml(rater.scores[dimension.id] ?? '')}" placeholder="0–100" aria-label="${escapeHtml(dimension.name)}分数"><b>分</b></div></label>`).join('')}</div>
  </article>`
}

function renderLevelSection(state: AppState, level: RaterLevel, roleId: RoleId): string {
  const meta = LEVEL_META[level]
  const raters = state.draft.raters[level]
  return `<section class="level-section">
    <header><div><span class="level-dot ${level}"></span><h2>${meta.name}</h2><small>${meta.description}</small></div><span class="weight-chip">${meta.weight}</span></header>
    <div class="rater-list">${raters.length ? raters.map((rater, index) => renderRaterCard(rater, level, index, roleId)).join('') : `<div class="empty-raters">该层级尚未添加评分人；不参与本次权重计算。</div>`}</div>
    <button class="button add-button" type="button" data-action="add-rater" data-level="${level}"><span>＋</span> 添加${meta.name.replace('评分', '')}评分人</button>
  </section>`
}

function scoringSummary(state: AppState): string {
  if (!state.draft.person.roleId) return ''
  const role = getRoleModel(state.draft.person.roleId)
  const calculated = calculateAssessment(state.draft, role)
  if (!calculated.ok) {
    const started = hasEnteredScores(state.draft)
    return `<div class="live-summary incomplete"><b>${started ? '评分尚未完整' : '等待录入评分'}</b><span>${started ? '每位已开始评分的人都需要填完六项有效分数。' : '至少完整填写一位评分人的六项分数，才可以生成能力图。'}</span></div>`
  }
  const levelNames = Object.entries(calculated.result.effectiveWeights).map(([level, weight]) => `${LEVEL_META[level as RaterLevel].name} ${Math.round((weight ?? 0) * 100)}%`)
  return `<div class="live-summary ready"><div><b>可以生成能力图</b><span>当前有效权重：${levelNames.join(' · ')}</span></div><strong>${formatScore(calculated.result.overallAverage)}<small>/ 5</small></strong></div>`
}

function renderScoring(state: AppState): string {
  const roleId = state.draft.person.roleId
  if (!roleId) return renderBasicInfo(state)
  const role = getRoleModel(roleId)
  const calculated = calculateAssessment(state.draft, role)
  return `<section class="page-section scoring-section">
    <div class="page-intro compact"><span class="section-kicker">STEP 02</span><h1>${escapeHtml(state.draft.person.name)}的多人评分</h1><p>${escapeHtml(role.name)}岗位 · 各层级可添加多位评分人，系统先求层级均分，再按有效层级自动归一权重。</p></div>
    ${renderStepBar(2)}
    <div class="scoring-guide"><span><i class="dot-blue"></i>填写 0–100 分，最多一位小数</span><span><i class="dot-grey"></i>完全空白的评分人自动忽略</span><span><i class="dot-cyan"></i>评分人姓名可不填写</span></div>
    ${RATER_LEVELS.map((level) => renderLevelSection(state, level, roleId)).join('')}
    <div class="sticky-actions"><div id="live-summary">${scoringSummary(state)}</div><div><button class="button ghost" type="button" data-action="back-basic">← 返回修改信息</button><button class="button primary" type="button" data-action="generate-result" ${calculated.ok ? '' : 'disabled'}>生成六维能力图 <span>→</span></button></div></div>
  </section>`
}

function renderCategoryScores(result: AssessmentResult): string {
  return `<section class="result-block"><div class="block-title"><span>能力结构参考</span><small>三个大类仅作网页辅助解读，不进入导出的能力卡片</small></div><div class="category-grid">${result.categoryScores.map((item, index) => `<div><i>0${index + 1}</i><span>${escapeHtml(item.category)}</span><b>${formatScore(item.score)}</b><small>/ 5</small></div>`).join('')}</div></section>`
}

function renderWeightSummary(result: AssessmentResult): string {
  return `<section class="result-block"><div class="block-title"><span>本次有效评分权重</span><small>同层级多人先取均分；缺席层级的权重会自动分摊</small></div><div class="weight-summary">${RATER_LEVELS.filter((level) => result.effectiveWeights[level] !== undefined).map((level) => `<span><i class="level-dot ${level}"></i>${LEVEL_META[level].name}<b>${Math.round((result.effectiveWeights[level] ?? 0) * 100)}%</b></span>`).join('')}</div></section>`
}

function renderResult(state: AppState): string {
  if (!state.result) return renderBasicInfo(state)
  const cardData = resultToCardData(state.result)
  return `<section class="page-section result-section">
    <div class="result-top"><div><span class="section-kicker">ASSESSMENT COMPLETE</span><h1>能力图已生成</h1><p>${state.previous ? `已找到 ${escapeHtml(state.previous.assessmentDate)} 的上次记录，并完成同维度对比。` : '当前没有可兼容的更早记录，先展示本次单次结果。'}</p></div><div class="result-actions"><button class="button ghost" type="button" data-action="back-scoring">返回评分</button><button class="button secondary" type="button" data-action="save-result">记录本次数据</button><button class="button primary" type="button" data-action="export-result">导出 PNG</button></div></div>
    <div class="radar-card-scroll">${renderRadarCard(cardData, state.previous, 'result-radar')}</div>
    <div class="result-grid">${renderCategoryScores(state.result)}${renderWeightSummary(state.result)}</div>
    <section class="result-block comparison-block"><div class="block-title"><span>六维历史对比</span><small>变化值 = 本次得分 − 上次得分</small></div>${renderComparisonTable(cardData, state.previous)}</section>
    <div class="bottom-actions"><button class="button ghost" type="button" data-action="new-assessment">开始一份新评估</button><button class="button secondary" type="button" data-action="show-history">查看历史记录</button></div>
  </section>`
}

function renderHistoryList(records: SavedAssessmentV1[], corrupt: boolean): string {
  return `<section class="page-section history-section">
    <div class="page-intro compact"><span class="section-kicker">LOCAL HISTORY</span><h1>历史评估记录</h1><p>记录只保存在当前浏览器中。你可以查看、导出或删除单条记录。</p></div>
    ${corrupt ? '<div class="inline-warning">检测到本地历史数据损坏，暂时无法读取原记录。新记录不会自动覆盖它。</div>' : ''}
    ${records.length ? `<div class="history-list">${records.map((record) => `<article class="history-item"><div class="history-date"><b>${escapeHtml(record.assessmentDate.slice(8, 10))}</b><span>${escapeHtml(record.assessmentDate.slice(0, 7))}</span></div><div class="history-person"><span>${escapeHtml(record.person.roleName)}</span><h2>${escapeHtml(record.person.name)}</h2><p>${escapeHtml(record.person.department)}</p></div><div class="history-score"><b>${formatScore(record.overallAverage)}</b><span>六维均分</span></div><div class="history-actions"><button class="button small secondary" type="button" data-action="view-history" data-record-id="${escapeHtml(record.id)}">查看</button><button class="button small ghost danger-text" type="button" data-action="delete-history" data-record-id="${escapeHtml(record.id)}">删除</button></div></article>`).join('')}</div>` : '<div class="empty-history"><span class="empty-hex">⌁</span><h2>还没有历史记录</h2><p>完成评估后点击“记录本次数据”，记录就会出现在这里。</p><button class="button primary" type="button" data-action="new-assessment">开始第一次评估</button></div>'}
  </section>`
}

function renderHistoryDetail(record: SavedAssessmentV1): string {
  const role = getRoleModel(record.person.roleId)
  return `<section class="page-section result-section history-detail">
    <div class="result-top"><div><button class="text-back" type="button" data-action="back-history">← 返回历史记录</button><h1>${escapeHtml(record.person.name)}的历史能力图</h1><p>${escapeHtml(record.person.department)} · ${escapeHtml(record.person.roleName)} · ${escapeHtml(record.assessmentDate)}</p></div><div class="result-actions"><button class="button ghost danger-text" type="button" data-action="delete-history" data-record-id="${escapeHtml(record.id)}">删除记录</button><button class="button primary" type="button" data-action="export-history" data-record-id="${escapeHtml(record.id)}">导出 PNG</button></div></div>
    <div class="radar-card-scroll">${renderRadarCard(savedToCardData(record, role.titleEn), null, 'history-radar')}</div>
  </section>`
}

export function createStandaloneApp(root: HTMLElement): void {
  const state: AppState = {
    view: 'assessment', step: 1, draft: createDraft(), result: null, previous: null,
    historyDetailId: null, fieldErrors: {}, notice: null,
  }

  const render = (): void => {
    let content = ''
    if (state.view === 'history') {
      const history = loadRecords()
      const detail = history.records.find((record) => record.id === state.historyDetailId)
      content = detail ? renderHistoryDetail(detail) : renderHistoryList(history.records, history.corrupt)
    } else if (state.step === 1) content = renderBasicInfo(state)
    else if (state.step === 2) content = renderScoring(state)
    else content = renderResult(state)
    root.innerHTML = renderShell(content, state)
  }

  const scrollTop = (): void => window.scrollTo({ top: 0, behavior: 'smooth' })

  const showNotice = (notice: NonNullable<Notice>): void => {
    state.notice = notice
    render()
    window.setTimeout(() => {
      if (state.notice === notice) { state.notice = null; render() }
    }, 5000)
  }

  const validateBasic = (): boolean => {
    const errors: Record<string, string> = {}
    if (!state.draft.person.name.trim()) errors['person.name'] = '请填写姓名'
    if (!state.draft.person.department.trim()) errors['person.department'] = '请填写部门'
    if (!state.draft.person.roleId) errors['person.roleId'] = '请选择职位'
    if (!state.draft.person.assessmentDate) errors['person.assessmentDate'] = '请选择评估日期'
    else if (state.draft.person.assessmentDate > todayLocal()) errors['person.assessmentDate'] = '评估日期不能晚于今天'
    state.fieldErrors = errors
    return Object.keys(errors).length === 0
  }

  const findRater = (level: RaterLevel, id: string): RaterInput | undefined => state.draft.raters[level].find((item) => item.id === id)

  const updateLiveSummary = (): void => {
    const summary = root.querySelector<HTMLElement>('#live-summary')
    if (!summary || !state.draft.person.roleId) return
    summary.innerHTML = scoringSummary(state)
    const calculated = calculateAssessment(state.draft, getRoleModel(state.draft.person.roleId))
    const generateButton = root.querySelector<HTMLButtonElement>('[data-action="generate-result"]')
    if (generateButton) generateButton.disabled = !calculated.ok
  }

  root.addEventListener('input', (event) => {
    const target = event.target
    if (!(target instanceof HTMLInputElement)) return
    const personField = target.dataset.personField as keyof AssessmentDraft['person'] | undefined
    if (personField) {
      state.draft.person = { ...state.draft.person, [personField]: target.value }
      delete state.fieldErrors[`person.${personField}`]
      return
    }
    const level = target.dataset.level as RaterLevel | undefined
    const raterId = target.dataset.raterId
    if (!level || !raterId) return
    const rater = findRater(level, raterId)
    if (!rater) return
    if (target.hasAttribute('data-rater-name')) rater.name = target.value
    const dimensionId = target.dataset.dimensionId
    if (dimensionId) {
      rater.scores[dimensionId] = target.value
      const roleId = state.draft.person.roleId
      if (roleId) {
        const classification = classifyRater(rater, getRoleModel(roleId).dimensions)
        const invalid = classification.status === 'incomplete' && (classification.invalidIds.includes(dimensionId) || (target.value.trim() === '' && Object.values(rater.scores).some((value) => value.trim())))
        target.classList.toggle('invalid', invalid)
      }
      updateLiveSummary()
    }
  })

  root.addEventListener('change', (event) => {
    const target = event.target
    if (!(target instanceof HTMLSelectElement) || target.dataset.personField !== 'roleId') return
    const nextRole = target.value as RoleId | ''
    if (nextRole === state.draft.person.roleId) return
    if (hasEnteredScores(state.draft) && !window.confirm('切换职位会清空当前已填写的评分，是否继续？')) { target.value = state.draft.person.roleId; return }
    state.draft.person.roleId = nextRole
    state.draft.raters = { superior: [], peer: [], subordinate: [] }
    if (nextRole) { state.draft.raters.superior.push(emptyRater(nextRole)); state.draft.raters.peer.push(emptyRater(nextRole)) }
    delete state.fieldErrors['person.roleId']
    render()
  })

  root.addEventListener('click', async (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-action]')
    if (!button) return
    const action = button.dataset.action

    if (action === 'dismiss-notice') { state.notice = null; render(); return }
    if (action === 'show-history') { state.view = 'history'; state.historyDetailId = null; state.notice = null; render(); scrollTop(); return }
    if (action === 'show-assessment') { state.view = 'assessment'; state.notice = null; render(); scrollTop(); return }
    if (action === 'new-assessment') { state.view = 'assessment'; state.step = 1; state.draft = createDraft(); state.result = null; state.previous = null; state.fieldErrors = {}; state.notice = null; render(); scrollTop(); return }
    if (action === 'go-scoring') { if (!validateBasic()) { render(); return }; state.step = 2; state.notice = null; render(); scrollTop(); return }
    if (action === 'back-basic') { state.step = 1; state.notice = null; render(); scrollTop(); return }
    if (action === 'back-scoring') { state.step = 2; state.notice = null; render(); scrollTop(); return }
    if (action === 'add-rater') {
      const level = button.dataset.level as RaterLevel
      if (!state.draft.person.roleId || !RATER_LEVELS.includes(level)) return
      state.draft.raters[level].push(emptyRater(state.draft.person.roleId)); render(); return
    }
    if (action === 'remove-rater') {
      const level = button.dataset.level as RaterLevel
      const raterId = button.dataset.raterId
      if (!raterId || !RATER_LEVELS.includes(level)) return
      state.draft.raters[level] = state.draft.raters[level].filter((rater) => rater.id !== raterId); render(); return
    }
    if (action === 'generate-result') {
      if (!state.draft.person.roleId || !validateBasic()) { state.step = 1; render(); return }
      const role = getRoleModel(state.draft.person.roleId)
      const calculated = calculateAssessment(state.draft, role)
      if (!calculated.ok) { showNotice({ kind: 'error', text: calculated.errors[0]?.message ?? '请检查评分内容' }); return }
      state.result = calculated.result
      const history = loadRecords()
      state.previous = findPreviousCompatibleRecord(calculated.result, history.records, role)
      state.step = 3
      state.notice = history.corrupt ? { kind: 'warning', text: '本地历史记录无法读取，因此本次暂不显示历史对比。' } : null
      render(); scrollTop(); return
    }
    if (action === 'save-result') {
      if (!state.result) return
      const storage = getBrowserStorage()
      if (!storage) { showNotice({ kind: 'error', text: '当前浏览器不允许使用本地存储，无法记录本次数据。' }); return }
      let privacyAcknowledged = false
      try { privacyAcknowledged = storage.getItem(PRIVACY_KEY) === 'yes' } catch { /* save will report failure */ }
      if (!privacyAcknowledged) {
        if (!window.confirm('记录将包含姓名、部门、职位、评估日期和六维得分，并仅保存在当前浏览器。是否同意保存？')) return
        try { storage.setItem(PRIVACY_KEY, 'yes') } catch { /* save will report failure */ }
      }
      const record = createSavedAssessment(state.result)
      let saved = saveRecord(storage, record, false)
      if (saved.status === 'duplicate') {
        if (!window.confirm('同一人、部门、职位和日期已有记录。是否用本次结果覆盖？')) return
        saved = saveRecord(storage, record, true)
      }
      if (saved.status === 'saved') showNotice({ kind: 'success', text: '本次评估已记录在当前浏览器。' })
      else showNotice({ kind: 'error', text: '记录失败：浏览器本地存储不可用或数据已损坏。' })
      return
    }
    if (action === 'export-result') {
      if (!state.result) return
      const card = root.querySelector<HTMLElement>('[data-export-card]')
      if (!card) return
      button.disabled = true; button.textContent = '正在生成…'
      try {
        await exportElementToPng(card, makePngFilename(state.result.person.name, state.result.roleName, state.result.person.assessmentDate))
        showNotice({ kind: 'success', text: 'PNG 已生成并开始下载。' })
      } catch {
        button.disabled = false; button.textContent = '导出 PNG'
        showNotice({ kind: 'error', text: 'PNG 生成失败，请使用最新版 Chrome 或 Edge 后重试。' })
      }
      return
    }
    if (action === 'view-history') { state.historyDetailId = button.dataset.recordId ?? null; render(); scrollTop(); return }
    if (action === 'back-history') { state.historyDetailId = null; render(); scrollTop(); return }
    if (action === 'delete-history') {
      const recordId = button.dataset.recordId
      if (!recordId || !window.confirm('确定删除这条历史记录吗？删除后无法恢复。')) return
      const storage = getBrowserStorage()
      if (!storage) { showNotice({ kind: 'error', text: '当前浏览器无法访问本地记录。' }); return }
      const removed = deleteRecord(storage, recordId)
      if (removed.status === 'deleted') { state.historyDetailId = null; showNotice({ kind: 'success', text: '历史记录已删除，无法恢复。' }) }
      else showNotice({ kind: 'error', text: '删除失败，本地存储不可用或数据已损坏。' })
      return
    }
    if (action === 'export-history') {
      const record = loadRecords().records.find((item) => item.id === button.dataset.recordId)
      const card = root.querySelector<HTMLElement>('[data-export-card]')
      if (!record || !card) return
      button.disabled = true; button.textContent = '正在生成…'
      try {
        await exportElementToPng(card, makePngFilename(record.person.name, record.person.roleName, record.assessmentDate))
        showNotice({ kind: 'success', text: 'PNG 已生成并开始下载。' })
      } catch {
        button.disabled = false; button.textContent = '导出 PNG'
        showNotice({ kind: 'error', text: 'PNG 生成失败，请稍后重试。' })
      }
    }
  })

  render()
}
