import { escapeHtml } from '../utils/html'
import { QUESTION_BANK } from '../../shared/question-bank/load'

export function createPortalApp(host: HTMLElement): void {
  const roleOptions = QUESTION_BANK.roles
    .map((role) => `<option value="${escapeHtml(role.id)}">${escapeHtml(role.name)}</option>`)
    .join('')

  host.innerHTML = `
    <style>
      .portal-page { max-width: 760px; margin: 0 auto; padding: 48px 20px 32px; }
      .portal-header { text-align: center; margin-bottom: 28px; }
      .portal-header h1 { margin: 0 0 8px; font-size: 28px; }
      .portal-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 18px; }
      .portal-card { background: #fff; border: 1px solid #e3ebf3; border-radius: 14px; padding: 24px; display: flex; flex-direction: column; gap: 14px; box-shadow: 0 6px 18px rgba(17, 120, 197, 0.06); }
      .portal-card h2 { margin: 0; font-size: 20px; }
      .portal-select { width: 100%; padding: 10px 12px; border: 1px solid #cfdce9; border-radius: 8px; font-size: 16px; }
      .portal-footer { text-align: center; margin-top: 28px; }
      .portal-footer a { color: #1178c5; text-decoration: none; }
      .portal-footer a:hover { text-decoration: underline; }
    </style>
    <div class="portal-page">
      <header class="portal-header">
        <h1>岗位六维能力评估</h1>
        <p class="muted">请选择你的身份进入对应页面</p>
      </header>
      <div class="portal-cards">
        <section class="portal-card">
          <h2>管理员</h2>
          <p class="muted">维护人员、批次和评分任务，查看结果并导出报告。</p>
          <a class="button primary" href="#/admin">进入管理员后台</a>
        </section>
        <section class="portal-card">
          <h2>评估人</h2>
          <p class="muted">选择你的岗位，进入六维问卷。</p>
          <label class="field"><span>岗位</span><select id="portal-role" class="portal-select">${roleOptions}</select></label>
          <a class="button primary" id="portal-go" href="#/q/sales">进入问卷</a>
        </section>
      </div>
      <footer class="portal-footer">
        <a href="#/standalone">旧版单机能力图</a>
      </footer>
    </div>
  `

  const select = host.querySelector<HTMLSelectElement>('#portal-role')
  const go = host.querySelector<HTMLAnchorElement>('#portal-go')
  if (select && go) {
    select.addEventListener('change', () => {
      go.setAttribute('href', `#/q/${encodeURIComponent(select.value)}`)
    })
  }
}
