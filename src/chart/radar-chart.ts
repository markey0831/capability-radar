import type { AssessmentResult, HistorySummary, SavedAssessmentV1 } from '../domain/types'
import { formatScore } from '../domain/score-engine'
import { badgePositions, BADGE_HEIGHT, BADGE_WIDTH, CHART_CENTER, hexagonPoints, pointsAttribute, scorePoints } from './radar-geometry'
import { escapeHtml } from '../utils/html'

export interface RadarCardData {
  name: string
  department: string
  roleName: string
  roleTitleEn: string
  assessmentDate: string
  dimensions: Array<{ dimensionId: string; name: string; score: number }>
  overallAverage: number
}

export function resultToCardData(result: AssessmentResult): RadarCardData {
  return {
    name: result.person.name,
    department: result.person.department,
    roleName: result.roleName,
    roleTitleEn: result.roleTitleEn,
    assessmentDate: result.person.assessmentDate,
    dimensions: result.dimensions,
    overallAverage: result.overallAverage,
  }
}

export function savedToCardData(record: SavedAssessmentV1, roleTitleEn = record.person.roleName.toUpperCase()): RadarCardData {
  return {
    name: record.person.name,
    department: record.person.department,
    roleName: record.person.roleName,
    roleTitleEn,
    assessmentDate: record.assessmentDate,
    dimensions: record.dimensions,
    overallAverage: record.overallAverage,
  }
}

export function calculateHistorySummary(current: RadarCardData, previous: SavedAssessmentV1): HistorySummary {
  const deltas = current.dimensions.map((dimension, index) => ({
    name: dimension.name,
    delta: dimension.score - (previous.dimensions[index]?.score ?? dimension.score),
  }))
  const improvements = deltas.filter((item) => item.delta > 0).sort((a, b) => b.delta - a.delta)
  const declines = deltas.filter((item) => item.delta < 0).sort((a, b) => a.delta - b.delta)
  return {
    previousAverage: previous.overallAverage,
    biggestImprovement: improvements[0] ?? null,
    biggestDecline: declines[0] ?? null,
  }
}

function cutBadgePath(): string {
  const w = BADGE_WIDTH
  const h = BADGE_HEIGHT
  return `M11 0 H${w - 11} L${w} 11 V${h - 11} L${w - 11} ${h} H11 L0 ${h - 11} V11 Z`
}

function renderBadge(x: number, y: number, name: string, score: number): string {
  return `<g transform="translate(${x} ${y})" class="radar-badge">
    <path d="${cutBadgePath()}" fill="#fff" stroke="#2b8bd2" stroke-width="2"/>
    <rect x="5" y="5" width="132" height="48" rx="6" fill="#eff8ff"/>
    <text x="71" y="23" text-anchor="middle" fill="#52718b" font-size="11">${escapeHtml(name)}</text>
    <text x="71" y="44" text-anchor="middle" fill="#0d64aa" font-size="20" font-weight="900">${formatScore(score)}</text>
  </g>`
}

function renderSummary(current: RadarCardData, previous: SavedAssessmentV1 | null): string {
  if (!previous) return ''
  const summary = calculateHistorySummary(current, previous)
  const improvement = summary.biggestImprovement
    ? `<span class="history-up">提升最多：${escapeHtml(summary.biggestImprovement.name)} +${formatScore(summary.biggestImprovement.delta)}</span>`
    : '<span>无提升项</span>'
  const decline = summary.biggestDecline
    ? `<span class="history-down">下降项：${escapeHtml(summary.biggestDecline.name)} ${formatScore(summary.biggestDecline.delta)}</span>`
    : '<span>无下降项</span>'
  return `<div class="radar-history-summary"><b>历史摘要</b><span>上次评估：${escapeHtml(previous.assessmentDate)}</span><span>上次六维均分：${formatScore(summary.previousAverage)}</span>${improvement}${decline}</div>`
}

export function renderRadarCard(current: RadarCardData, previous: SavedAssessmentV1 | null, idPrefix = 'radar'): string {
  const scores = current.dimensions.map((item) => item.score)
  const dataPoints = pointsAttribute(scorePoints(scores, 169))
  const previousPoints = previous ? pointsAttribute(scorePoints(previous.dimensions.map((item) => item.score), 169)) : ''
  const badges = badgePositions().map((position, index) => renderBadge(position.x, position.y, current.dimensions[index].name, scores[index])).join('')
  const grid = [1, 2, 3, 4, 5].map((level) => `<polygon points="${pointsAttribute(hexagonPoints(169 * level / 5))}" fill="${level === 5 ? 'rgba(255,255,255,.84)' : 'none'}" stroke="${level === 5 ? `url(#${idPrefix}-ring)` : '#c5def1'}" stroke-width="${level === 5 ? 3.2 : 1}"/>`).join('')
  const axes = hexagonPoints(169).map((point) => `<line x1="0" y1="0" x2="${point.x.toFixed(1)}" y2="${point.y.toFixed(1)}"/>`).join('')
  const nodes = scorePoints(scores, 169).map((point) => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="6"/>`).join('')
  const legend = previous ? `<div class="radar-legend"><span><i class="legend-current"></i>本次 ${escapeHtml(current.assessmentDate)}</span><span><i class="legend-previous"></i>上次 ${escapeHtml(previous.assessmentDate)}</span></div>` : ''

  return `<article class="radar-card" data-export-card>
    <div class="radar-grid-bg" aria-hidden="true"></div>
    <header class="radar-card-header">
      <div><p class="eyebrow">AI + XR CAPABILITY PROFILE</p><h2>${escapeHtml(current.name)} <span>｜</span> ${escapeHtml(current.roleName)}能力图</h2><p>${escapeHtml(current.department)} · 评估日期：${escapeHtml(current.assessmentDate)}</p></div>
      ${legend || `<span class="role-chip">${escapeHtml(current.roleTitleEn)}</span>`}
    </header>
    <div class="radar-svg-wrap">
      <svg class="radar-svg" viewBox="0 0 800 540" role="img" aria-label="${escapeHtml(current.name)}${escapeHtml(current.roleName)}六维能力图">
        <defs>
          <filter id="${idPrefix}-shadow"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#1e70b7" flood-opacity=".18"/></filter>
          <linearGradient id="${idPrefix}-poly" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1677c8" stop-opacity=".3"/><stop offset="1" stop-color="#58b9f1" stop-opacity=".1"/></linearGradient>
          <linearGradient id="${idPrefix}-ring" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0d64aa"/><stop offset=".52" stop-color="#40a9e8"/><stop offset="1" stop-color="#0d64aa"/></linearGradient>
        </defs>
        <g transform="translate(${CHART_CENTER.x} ${CHART_CENTER.y})">
          <polygon points="${pointsAttribute(hexagonPoints(178))}" fill="#f8fcff" stroke="#b8daf3" stroke-width="14" opacity=".5"/>
          ${grid}<g stroke="#c5def1">${axes}</g>
          ${previous ? `<polygon points="${previousPoints}" fill="none" stroke="#90a8ba" stroke-width="3" stroke-dasharray="8 6"/>` : ''}
          <polygon points="${dataPoints}" fill="url(#${idPrefix}-poly)" stroke="#1178c5" stroke-width="4"/>
          <g fill="#fff" stroke="#1178c5" stroke-width="4">${nodes}</g>
          <circle r="35" fill="#fff" stroke="#b8daf3" stroke-width="9"/><circle r="31" fill="#0e6eb7" filter="url(#${idPrefix}-shadow)"/>
          <text y="-4" text-anchor="middle" fill="#dff3ff" font-size="9" font-weight="700">六维均分</text><text y="18" text-anchor="middle" fill="#fff" font-size="22" font-weight="900">${formatScore(current.overallAverage)}</text>
        </g>
        <g filter="url(#${idPrefix}-shadow)">${badges}</g>
        <g stroke="#9dc8e8" stroke-width="1.5" stroke-dasharray="3 4"><line x1="400" y1="60" x2="400" y2="92"/><line x1="574" y1="170" x2="616" y2="161"/><line x1="574" y1="370" x2="616" y2="379"/><line x1="400" y1="448" x2="400" y2="480"/><line x1="226" y1="370" x2="184" y2="379"/><line x1="226" y1="170" x2="184" y2="161"/></g>
      </svg>
    </div>
    ${renderSummary(current, previous)}
  </article>`
}

export function renderComparisonTable(current: RadarCardData, previous: SavedAssessmentV1 | null): string {
  if (!previous) return '<div class="empty-comparison">暂无可对比的历史记录</div>'
  const rows = current.dimensions.map((dimension, index) => {
    const oldScore = previous.dimensions[index].score
    const delta = dimension.score - oldScore
    const deltaClass = delta > 0 ? 'delta-up' : delta < 0 ? 'delta-down' : ''
    return `<tr><th>${escapeHtml(dimension.name)}</th><td>${formatScore(oldScore)}</td><td>${formatScore(dimension.score)}</td><td class="${deltaClass}">${delta > 0 ? '+' : ''}${formatScore(delta)}</td></tr>`
  }).join('')
  return `<div class="comparison-table-wrap"><table class="comparison-table"><thead><tr><th>能力维度</th><th>上次</th><th>本次</th><th>变化</th></tr></thead><tbody>${rows}</tbody></table></div>`
}
