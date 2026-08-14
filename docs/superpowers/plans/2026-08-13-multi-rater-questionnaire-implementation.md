# 多人问卷与自动汇总系统实施计划

- 日期：2026-08-13
- 对应规格：`docs/superpowers/specs/2026-08-13-multi-rater-questionnaire-design.md`
- 当前状态：实施中；2026-08-13 19:51 按用户要求暂停，续作入口见 `docs/WORK_PROGRESS.md`
- 实施原则：先测试、后实现；每个阶段独立可验证；正式环境最后启用

## 1. 实施目标

把现有 Vite + TypeScript 纯前端能力图工具升级为：

1. EdgeOne Makers 承载的公开问卷和管理员网页。
2. CloudBase HTTP 云函数提供的公开及管理 API。
3. CloudBase 文档型数据库保存人员、批次、任务、答卷和结果。
4. 两个 CloudBase 定时函数分别处理批次到期和每周备份。
5. 服务端统一计分，管理员查看完成进度、能力图、历史趋势并导出 PNG、PDF、Excel。

CloudBase Node.js 云函数使用 `@cloudbase/node-sdk`；任务提交和批次状态变更使用服务端事务；HTTP API 通过 CloudBase HTTP 访问服务发布。实施以官方文档为准：

- [云函数访问 CloudBase 资源](https://docs.cloudbase.net/cloud-function/resource-integration/cloudbase)
- [文档型数据库事务](https://docs.cloudbase.net/database/transaction)
- [通过 HTTP 访问云函数](https://docs.cloudbase.net/service/access-cloud-function)
- [云函数配置和定时触发器](https://docs.cloudbase.net/cli-v1/functions/configs)

## 2. 实施前基线

2026-08-13 已验证：

```text
Test Files  5 passed (5)
Tests       40 passed (40)
npm.cmd run build 通过
```

每完成一个任务都要运行与该任务相关的测试；每个阶段结束必须重新运行：

```powershell
npm.cmd run test:run
npm.cmd run build
```

不得删除或改写用户现有浏览器 `localStorage` 历史记录。旧的手工评分页面在开发期保留为内部回归入口，正式上线前从公开导航移除。

## 3. 目录目标

```text
capability-radar-app/
├─ shared/                         # 前后端共享类型、题库、计分和规范化逻辑
├─ src/
│  ├─ app/                         # 路由、页面外壳、会话与通用组件
│  ├─ questionnaire/               # 公开问卷流程
│  ├─ admin/                       # 管理后台
│  ├─ results/                     # 汇总结果、历史和报告视图
│  ├─ chart/                       # 雷达图（复用并扩展现有代码）
│  └─ export/                      # PNG/PDF 前端导出
├─ cloudfunctions/
│  ├─ api/                         # HTTP API
│  ├─ close-expired-batches/       # 批次到期定时任务
│  └─ weekly-backup/               # 每周加密备份
├─ cloudbase/
│  ├─ indexes.json                 # 数据库索引声明
│  ├─ seed/                        # 题库初始种子和校验摘要
│  └─ scripts/                     # 初始化、核验、恢复脚本
├─ tests/
│  ├─ integration/                 # API/仓储集成测试
│  └─ e2e/                         # 浏览器端到端测试
└─ docs/runbooks/                  # 部署、备份、恢复和回滚手册
```

## 4. 任务清单

### 任务 0：建立安全的实施基线和工具链

**修改文件**

- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `vite.config.ts`
- `.gitignore`
- 新建 `.env.example`
- 新建 `tsconfig.shared.json`
- 新建 `cloudfunctions/*/package.json`
- 新建 `cloudbaserc.example.json`

**步骤**

1. 保留现有 Node.js 20.19+ 要求。
2. 加入前端运行依赖 `jspdf`，用于把已经排版好的两页报告画布写入 PDF。
3. 加入 CloudBase API 依赖：`@cloudbase/node-sdk`、`exceljs` 和最小的 HTTP 路由/校验依赖；不把任何密钥放入依赖配置。
4. 加入开发依赖：后端 TypeScript 构建工具、`@types/node`、API 测试工具和 `@playwright/test`。
5. 增加脚本：`test:unit`、`test:integration`、`test:e2e`、`build:shared`、`build:functions`、`build:all`、`verify:question-bank`、`security:scan`。
6. `.env.example` 只列变量名和说明，不放真实值。至少包含 API 地址、允许域名、管理密码摘要/盐值、会话密钥、任务令牌密钥、备份密钥和 CloudBase 环境 ID。
7. `cloudbaserc.example.json` 不包含生产环境 ID 或密钥；真实 `cloudbaserc.json` 加入 `.gitignore`。
8. 检查本机是否安装 Git。当前没有 Git 可执行程序，也未确认存在仓库；实施前向用户说明。除非用户授权，不自动初始化新仓库。

**验证**

```powershell
npm.cmd install
npm.cmd run test:run
npm.cmd run build
```

**完成标准**：旧 40 项测试和生产构建仍通过；示例配置中不含真实凭证。

### 任务 1：生成唯一的版本化共享题库

**修改/新增文件**

- `scripts/export_question_bank_json.py`
- `shared/question-bank/v1.json`
- `shared/question-bank/schema.ts`
- `shared/question-bank/load.ts`
- `shared/question-bank/question-bank.test.ts`
- `src/config/role-models.ts`
- `cloudbase/seed/questionnaire-v1.json`

**步骤**

1. 继续把 `scripts/question_bank/*.py` 作为现有 210 题的人工作业源，不手工复制题目。
2. 编写导出脚本，为 7 个职位、42 个维度和 210 道题生成稳定 ID、版本号和 SHA-256 摘要。
3. 每道题输出 5 个行为选项；“无法判断”由系统统一添加，不重复写进每题。
4. 将现有 `role-models.ts` 的职位 ID、维度 ID 和题库 ID 对齐，保持当前雷达图标签不变。
5. 生成完全相同的 CloudBase 种子文件，并用摘要检查前端、后端种子一致。

**先写测试**

- 恰好 7 个职位、每职位 6 维、每维 5 题。
- 全部职位/维度/题目 ID 唯一且稳定。
- 每题 A—E 五个选项都非空。
- 题库职位和维度名称与能力图模型逐项一致。
- 同一源文件重复导出得到相同摘要。

**验证**

```powershell
python .\scripts\export_question_bank_json.py --check
npm.cmd run verify:question-bank
npm.cmd run test:unit
```

**完成标准**：前后端只引用同一份版本化题库，不再存在两套手工维护的题目数据。

### 任务 2：实现共享计分、完整性和身份规范化核心

**新增文件**

- `shared/domain/types.ts`
- `shared/scoring/questionnaire-score.ts`
- `shared/scoring/questionnaire-score.test.ts`
- `shared/identity/normalize-identity.ts`
- `shared/identity/normalize-identity.test.ts`
- `shared/results/history-compatibility.ts`
- `shared/results/history-compatibility.test.ts`

**修改文件**

- `src/domain/score-engine.ts`
- `src/domain/types.ts`

**步骤**

1. 定义答案代码 `A | B | C | D | E | UNABLE`，分值为 20/40/60/80/100/缺失。
2. 实现单人单维计分：至少 3 道 A—E 才有效。
3. 实现逐维的同层级平均，而不是要求评分人六维全部有效。
4. 实现上级/平级/下级 0.5/0.3/0.2 加权与逐维缺失归一。
5. 实现六维完整性：缺一维时综合分为 `null`，雷达图状态为 `incomplete`。
6. 实现同人员、同职位、相同维度稳定 ID 的历史兼容判断。
7. 姓名和部门规范化：首尾空白移除、全角空格转半角、连续空白合并；保留原始展示值。
8. 现有 0—100 手工评分引擎保留为兼容模块，但新问卷服务端只调用新的共享计分核心。

**先写测试**

- 每种答案代码映射。
- 单维有效题数 0、1、2、3、4、5 的边界。
- 一名评分人在不同维度有效性不同。
- 三层齐全、缺上级、缺平级、缺下级、只剩一层级。
- 同层级人数不改变基础权重。
- 六维缺失时不生成综合分。
- 换岗或维度 ID 变化时拒绝历史叠加。

**验证**

```powershell
npx.cmd vitest run shared/scoring shared/identity shared/results --maxWorkers=1 --pool=forks
npm.cmd run test:run
```

**完成标准**：前端预览、API 提交、批次快照和导出全部能调用同一个纯计分函数。

### 任务 3：搭建 CloudBase API 外壳和可替换数据仓储

**新增文件**

- `cloudfunctions/api/src/index.ts`
- `cloudfunctions/api/src/app.ts`
- `cloudfunctions/api/src/config.ts`
- `cloudfunctions/api/src/http/router.ts`
- `cloudfunctions/api/src/http/errors.ts`
- `cloudfunctions/api/src/http/cors.ts`
- `cloudfunctions/api/src/db/cloudbase.ts`
- `cloudfunctions/api/src/repositories/contracts.ts`
- `cloudfunctions/api/src/repositories/cloudbase/*.ts`
- `cloudfunctions/api/src/repositories/memory/*.ts`
- `cloudfunctions/api/src/app.test.ts`

**步骤**

1. 建立单个 HTTP API 函数，公开与管理路由共用统一错误处理和请求 ID。
2. 所有业务逻辑依赖仓储接口；单元测试使用内存仓储，CloudBase 集成测试使用真实测试环境。
3. 配置严格 JSON 请求大小限制、字段长度和响应头。
4. CORS 只接受配置中的正式/测试前端 Origin；公开 GET 也不使用 `*`。
5. 错误响应只返回稳定错误码、通俗中文和请求 ID，不返回堆栈或数据库细节。
6. 配置加载时检查必需环境变量；生产环境缺变量直接拒绝启动。

**先写测试**

- 未知路由返回 404 结构。
- 非 JSON 写请求返回 415。
- 超大请求返回 413。
- 不允许的 Origin 不得到 CORS 凭证。
- 内部异常不泄露堆栈。

**验证**

```powershell
npm.cmd run build:functions
npm.cmd run test:integration -- --runInBand
```

**完成标准**：本地可用内存仓储启动 API；CloudBase 依赖被隔离在仓储适配层。

### 任务 4：建立 CloudBase 集合、索引、种子和核验脚本

**新增文件**

- `cloudbase/indexes.json`
- `cloudbase/scripts/provision.mjs`
- `cloudbase/scripts/seed-questionnaire.mjs`
- `cloudbase/scripts/verify-environment.mjs`
- `cloudbase/scripts/README.md`
- `tests/integration/cloudbase-environment.test.ts`

**步骤**

1. 创建规格定义的 10 个集合：人员、题库版本、批次、当前批次、批次人员、任务、答卷、结果快照、管理会话、操作日志。
2. 创建规格中的唯一索引和查询索引。
3. 种入题库 v1；如果相同版本摘要已存在则幂等退出，摘要不同则拒绝覆盖。
4. 核验脚本检查集合、索引、题库摘要以及测试读写权限。
5. `provision` 默认只允许测试环境；生产环境需要显式 `--confirm-env <envId>`。
6. 不在脚本参数或日志中输出密钥。

**先写测试**

- 重复种子不产生第二份题库。
- 不同摘要不能覆盖已发布版本。
- 重复批次人员和重复任务被唯一索引拒绝。
- 真实测试环境支持服务端 `runTransaction`。

**验证**

```powershell
node .\cloudbase\scripts\verify-environment.mjs --env <测试环境ID>
npm.cmd run test:integration
```

**完成标准**：测试 CloudBase 环境的数据结构可重复创建并通过核验。

### 任务 5：实现公开的批次查询、身份匹配和任务令牌

**新增文件**

- `cloudfunctions/api/src/public/get-questionnaire.ts`
- `cloudfunctions/api/src/public/lookup-tasks.ts`
- `cloudfunctions/api/src/public/get-task-form.ts`
- `cloudfunctions/api/src/security/task-token.ts`
- `cloudfunctions/api/src/security/rate-limit.ts`
- 对应 `*.test.ts`

**步骤**

1. `GET /public/questionnaire/:roleCode` 只返回职位、开放批次、截止时间和匿名说明。
2. `POST /public/tasks/lookup` 接收姓名和部门，规范化后匹配预分配任务。
3. 查找失败统一返回“未找到待评价任务”，不区分人员不存在、部门不符或无任务。
4. 成功后只返回这个评分人的任务；层级只读。
5. 为每条可填写任务签发短期 HMAC 任务令牌，绑定任务、批次、题库版本和到期时间。
6. 对身份匹配按 IP 和时间窗口限流；不要把规范化姓名写入公开访问日志。

**先写测试**

- 没有开放批次和批次到期。
- 同名不同部门只返回正确任务。
- 错误姓名、错误部门、无任务的对外响应一致。
- 已提交任务只返回状态和时间，不返回答案。
- 篡改或过期令牌被拒绝。
- 任何公开响应都不含其他评分人、答卷和结果字段。

**完成标准**：公共链接不能枚举全体人员，评分人只能读取自己的任务。

### 任务 6：实现服务端答卷校验、计分、幂等和事务提交

**新增文件**

- `cloudfunctions/api/src/public/submit-questionnaire.ts`
- `cloudfunctions/api/src/services/submission-service.ts`
- `cloudfunctions/api/src/services/submission-service.test.ts`
- `tests/integration/submission-transaction.test.ts`

**步骤**

1. 接收任务令牌、UUID 幂等键和 30 道答案代码，不接收前端传来的分数。
2. 重新读取并校验任务、批次、截止时间、题库版本和答案完整性。
3. 调用共享计分核心生成单人六维有效题数和得分。
4. 至少一个维度有效才允许提交。
5. 在 CloudBase `runTransaction` 中读取任务状态、写入答卷、更新任务状态和当前答卷 ID。
6. 同一幂等键重复请求返回原成功结果；不同幂等键重复提交同一任务返回“已提交”。
7. 提交成功响应仅包含被评估人、职位和提交时间。

**先写测试**

- 非法答案、少于 30 题、所有维度均无效。
- 填写期间批次到期。
- 连续点击和响应丢失后的重试。
- 两个并发请求争抢同一任务，只有一个有效答卷。
- 答卷写入失败时任务状态不改变。

**验证**

```powershell
npx.cmd vitest run cloudfunctions/api/src/services/submission-service.test.ts tests/integration/submission-transaction.test.ts
```

**完成标准**：事务失败没有中间态，同一任务永远最多一份当前有效答卷。

### 任务 7：实现管理员登录、会话、CSRF和审计框架

**新增文件**

- `cloudfunctions/api/src/admin/auth.ts`
- `cloudfunctions/api/src/security/password.ts`
- `cloudfunctions/api/src/security/session.ts`
- `cloudfunctions/api/src/security/csrf.ts`
- `cloudfunctions/api/src/audit/audit-service.ts`
- 对应 `*.test.ts`
- `scripts/generate-admin-password.mjs`

**步骤**

1. 提供本地脚本，用 `scrypt` 生成管理密码摘要和随机盐值；只输出一次，用户复制到 CloudBase 环境变量。
2. 登录成功创建随机会话，数据库只保存令牌摘要；Cookie 设置 `HttpOnly`、`Secure`、`SameSite=Lax` 和两小时到期。
3. 登录后签发与会话绑定的 CSRF 令牌；所有管理写请求同时校验 Origin、Cookie 和 CSRF 请求头。
4. 主动退出立即撤销会话。
5. 登录失败按 IP 限流；日志不得记录密码、Cookie 或 CSRF 值。
6. 建立统一审计函数，后续管理操作只记录必要字段。

**先写测试**

- 正确和错误密码；摘要比较不使用普通字符串比较。
- 两小时到期、退出失效、伪造 Cookie。
- 缺 Origin、跨域 Origin、缺 CSRF、错误 CSRF。
- 连续错误登录触发限流。
- 日志序列化不出现敏感值。

**完成标准**：没有有效会话和 CSRF 的管理写请求全部被拒绝。

### 任务 8：实现人员、批次、批次人员和任务管理 API

**新增文件**

- `cloudfunctions/api/src/admin/people.ts`
- `cloudfunctions/api/src/admin/batches.ts`
- `cloudfunctions/api/src/admin/participants.ts`
- `cloudfunctions/api/src/admin/assignments.ts`
- `cloudfunctions/api/src/admin/import-excel.ts`
- `cloudfunctions/api/src/services/batch-service.ts`
- `cloudfunctions/api/src/services/import-service.ts`
- 对应 `*.test.ts`

**步骤**

1. 人员支持新增、修改、启用、停用；历史快照不回写。
2. 批次支持草稿创建、评估日期、开放时间、截止时间和题库版本锁定。
3. 批次人员保存姓名、部门和职位快照。
4. 任务分配保存评分人快照和层级；同一评分人不能对同一被评估人在同一批次产生第二条任务。
5. 开放批次时使用事务更新 `role_active_batches`；存在同岗开放批次时拒绝。
6. Excel 导入先逐行解析和验证，显示错误行；通过后再批量写入。
7. 支持复制上一批次配置，但重新生成批次人员和任务 ID。
8. 所有重要动作写入审计日志。

**先写测试**

- 人员修改不改变历史快照。
- 姓名和部门相同导致任务不可区分时阻止开放。
- 同岗两个批次并发开放只有一个成功。
- 导入中混合正确/错误行时，错误行不写入且原因准确。
- 复制上一批次不会关联旧任务或答卷。

**完成标准**：管理员能够完整准备一个可开放批次，评分人能够准确匹配自己的任务。

### 任务 9：实现阶段性汇总、关闭快照、作废重填和历史查询

**新增文件**

- `cloudfunctions/api/src/services/result-service.ts`
- `cloudfunctions/api/src/services/result-service.test.ts`
- `cloudfunctions/api/src/services/batch-lifecycle.ts`
- `cloudfunctions/api/src/services/batch-lifecycle.test.ts`
- `cloudfunctions/api/src/admin/results.ts`
- `cloudfunctions/api/src/admin/submissions.ts`

**步骤**

1. 开放批次按当前有效答卷实时汇总；按维度分别计算有效层级和样本数。
2. 六维不完整时返回已有分数和 `null` 缺失项，不返回综合分。
3. 关闭批次时在事务控制下冻结状态并生成不可变结果快照；不完整结果也生成快照。
4. 作废答卷必须填写原因；只允许开放批次，任务恢复待提交，旧答卷保留。
5. 重开批次时旧快照标记失效；再次关闭生成递增版本。
6. 历史查询只返回同人员、同职位和相同维度稳定 ID 的最近一期结果。

**先写测试**

- 单个评分人在部分维度有效。
- 各维样本数不同。
- 六维缺失时综合分和雷达图状态为空。
- 关闭后作废被拒绝；重开后可作废。
- 两次关闭生成两个版本且只返回最新有效快照。
- 跨职位历史不进入比较结果。

**完成标准**：开放结果可实时变化，关闭结果可复现且历史比较语义正确。

### 任务 10：拆分现有前端并建立路由、API客户端和公共外壳

**新增文件**

- `src/app/router.ts`
- `src/app/app-shell.ts`
- `src/app/api-client.ts`
- `src/app/session-store.ts`
- `src/app/components/*.ts`
- `src/legacy/standalone-app.ts`
- 对应 `*.test.ts`

**修改文件**

- `src/main.ts`
- `src/app.ts`
- `src/style.css`
- `index.html`

**步骤**

1. 把 404 行的现有 `app.ts` 拆分，先无行为变化地移到兼容模块并保留现有测试。
2. 建立轻量 History API 路由，不引入大型前端框架。
3. 新建公共问卷和管理后台页面外壳；正式路由为 `/q/:roleCode` 和 `/admin/*`。
4. API 客户端统一处理超时、请求 ID、认证失效、CSRF 和通俗错误消息。
5. 增加加载、空状态、网络失败和重试组件。
6. 蓝白视觉变量保留，新增移动端和管理端布局变量；不在此任务实现业务页面。

**先写测试**

- 直接访问深层路由能渲染正确页面壳。
- 认证失效跳转登录。
- API 错误不清空页面已有数据。
- 兼容页原有测试继续通过。

**完成标准**：旧功能未回归，新路由和 API 层可以独立扩展。

### 任务 11：实现手机端问卷和本机草稿

**新增文件**

- `src/questionnaire/questionnaire-page.ts`
- `src/questionnaire/identity-step.ts`
- `src/questionnaire/task-list-step.ts`
- `src/questionnaire/dimension-step.ts`
- `src/questionnaire/review-step.ts`
- `src/questionnaire/success-step.ts`
- `src/questionnaire/draft-store.ts`
- `src/questionnaire/questionnaire-state.ts`
- 对应 `*.test.ts`

**步骤**

1. 展示职位、批次、截止时间和匿名说明。
2. 姓名和部门匹配后只展示自己的任务，层级只读。
3. 六个维度分六页，每页五题，A—E 展示完整行为描述，增加“无法判断”。
4. 显示总进度、维度进度、返回修改和未答提醒。
5. 草稿键使用批次、任务和题库版本；每次答案变化节流保存。
6. 提交前显示每维有效题数；部分维度无效时二次确认。
7. 提交时生成幂等键、锁定按钮；网络错误使用同一键重试。
8. 成功后清草稿，只显示成功信息，不显示分数。

**先写测试**

- 6 页 × 5 题，前后导航不丢答案。
- 草稿重载恢复、换任务不串数据、提交后清除。
- 0 个有效维度不能提交；部分有效允许确认后提交。
- 连续点击只发一次请求；失败重试复用幂等键。
- 页面文本不出现任何得分或他人姓名。

**手工验证**

- iOS Safari/微信浏览器。
- Android Chrome/微信浏览器。
- 320px、375px、430px 宽度和大字体设置。

**完成标准**：评分人可在手机上从身份匹配完成提交，断网或关闭页面不会意外丢失草稿。

### 任务 12：实现管理员登录、人员和批次任务后台

**新增文件**

- `src/admin/login-page.ts`
- `src/admin/dashboard-page.ts`
- `src/admin/people-page.ts`
- `src/admin/batches-page.ts`
- `src/admin/batch-wizard.ts`
- `src/admin/progress-page.ts`
- `src/admin/submissions-page.ts`
- `src/admin/import-dialog.ts`
- 对应 `*.test.ts`

**步骤**

1. 登录页只提交密码，浏览器不持久保存密码。
2. 工作台显示开放批次、截止时间、任务数、完成率和缺失维度人数。
3. 人员页支持查询、新增、编辑、启用、停用和 Excel 导入。
4. 四步批次向导完成批次信息、被评估人、任务分配、检查开放。
5. 进度页按被评估人—层级—评分人展开，支持筛选并复制提醒名单。
6. 答卷页只读显示答案和有效性；作废要求原因和二次确认。
7. 关闭、延长、重开、归档均显示影响范围并确认。

**先写测试**

- 未登录不能进入管理页面。
- 批次向导不能跳过必填步骤。
- 待提醒名单只包含未提交/逾期任务。
- 作废不提供直接编辑答案入口。
- 关闭后管理页面只读。

**完成标准**：管理员不用接触数据库即可完成一轮评估的日常管理。

### 任务 13：实现能力结果、历史对比和匿名 PNG/PDF

**新增/修改文件**

- `src/results/result-page.ts`
- `src/results/result-view-model.ts`
- `src/results/history-comparison.ts`
- `src/results/report-layout.ts`
- `src/export/pdf-export.ts`
- `src/export/png-export.ts`
- `src/chart/radar-chart.ts`
- `src/chart/radar-geometry.ts`
- 对应 `*.test.ts`

**步骤**

1. 结果页显示人员、职位、批次、日期、状态、六维分和逐维/逐层样本数。
2. 六维缺失时只显示分数卡和“待补充”，雷达图组件不接收伪造的 0 分。
3. 六维完整时绘制深蓝本次结果；兼容历史存在时绘制浅蓝虚线上次结果。
4. PNG 使用单页蓝白能力卡，包含姓名和职位，不含评分人身份。
5. PDF 使用两张 A4 画布截图写入 `jsPDF`，第一、二页内容按规格固定。
6. 阶段性导出加入明显水印；关闭快照显示最终结果。
7. 文件名中的非法字符替换为安全下划线。

**先写测试**

- 缺一维时 SVG/canvas 中不出现闭合能力多边形。
- 跨职位没有历史叠加图例。
- 匿名报告模型中不存在评分人字段。
- PNG/PDF 文件名、页数、人员和职位正确。
- 0—5 固定刻度和六标签对称位置保持现有视觉规范。

**完成标准**：管理员看到的网页、PNG 和 PDF 数字一致，匿名文件不含评分人姓名。

### 任务 14：实现管理员 Excel 四工作表导出

**新增文件**

- `cloudfunctions/api/src/admin/export-excel.ts`
- `cloudfunctions/api/src/export/excel-workbook.ts`
- `cloudfunctions/api/src/export/excel-workbook.test.ts`
- `src/admin/export-actions.ts`

**步骤**

1. 服务端查询同一批次的汇总、分层、答卷和任务进度，避免前端拼接敏感数据。
2. 使用 `exceljs` 生成四个固定工作表。
3. 所有用户输入文本如果以 `= + - @` 开头，前置单引号，防止公式注入。
4. 时间统一按 Asia/Shanghai 格式化，并额外保留 ISO 时间列。
5. 作废答卷保留状态、原因和时间；默认汇总只使用有效答卷。
6. 下载接口验证管理员会话并写审计日志。

**先写测试**

- 四个工作表名称、列头和行数准确。
- 六维结果与结果服务完全一致。
- 公式注入字符串打开后为普通文本。
- 匿名导出模型与含身份 Excel 模型严格分离。

**完成标准**：Excel 可以追溯每题答案和计算过程，且不会执行用户输入公式。

### 任务 15：实现批次到期、每周加密备份和恢复工具

**新增文件**

- `cloudfunctions/close-expired-batches/src/index.ts`
- `cloudfunctions/close-expired-batches/src/index.test.ts`
- `cloudfunctions/weekly-backup/src/index.ts`
- `cloudfunctions/weekly-backup/src/index.test.ts`
- `cloudbase/scripts/restore-backup.mjs`
- `cloudbase/scripts/verify-backup.mjs`
- `docs/runbooks/backup-and-restore.md`

**步骤**

1. 到期函数每 5 分钟扫描开放且到期的批次，调用同一生命周期服务关闭并生成快照。
2. 提交 API 始终直接比较截止时间，因此不依赖定时器及时性。
3. 到期函数采用幂等状态检查，多次触发不生成重复快照。
4. 每周备份函数导出全部业务集合，生成清单和摘要，用 AES-256-GCM 加密后上传 CloudBase 存储。
5. 备份密钥只读取环境变量；备份日志只记录文件 ID、数量、摘要和结果。
6. 存储生命周期保留 90 天。
7. 恢复脚本默认只允许非生产环境；生产恢复需要显式环境确认和用户批准。
8. CloudBase 每个函数只配置一个定时触发器，因此到期和备份必须是两个独立函数。部署后在控制台确认 Cron 时区。

**先写测试**

- 定时器重复触发仍只有一个有效快照版本。
- 备份加密后不能以明文搜索到姓名。
- 密钥错误时恢复失败且不写入半份数据。
- 恢复后集合数量、关系和抽样得分一致。

**完成标准**：测试环境完成一次真实备份和恢复演练并留存核验记录。

### 任务 16：安全、隐私和数据清理加固

**新增文件**

- `scripts/security/scan-dist.mjs`
- `cloudfunctions/api/src/admin/purge-archive.ts`
- `cloudfunctions/api/src/services/purge-service.ts`
- `cloudfunctions/api/src/services/purge-service.test.ts`
- `docs/runbooks/security-checklist.md`

**步骤**

1. 扫描生产构建，禁止出现管理密码摘要、盐值、会话/任务/备份密钥和测试敏感数据。
2. 为 EdgeOne 配置 CSP、`X-Content-Type-Options`、`Referrer-Policy` 和合理的 `Permissions-Policy`。
3. 检查所有 HTML 插值走现有转义工具，不把导入文本当 HTML。
4. 永久清理仅允许归档批次，必须先成功备份、预览影响数量并输入批次名称二次确认。
5. 清理作为可重试服务端批处理；保留不含评分明细的审计结果。
6. 人员仍被其他批次引用时不能物理删除，只能停用。
7. 对登录、身份匹配、提交、导出和清理执行限流/权限测试。

**验证**

```powershell
npm.cmd run build:all
npm.cmd run security:scan
```

**完成标准**：安全清单全部通过，公开构建和公开接口均不泄露评分人或服务端凭证。

### 任务 17：端到端、并发、视觉和可访问性验收

**新增文件**

- `playwright.config.ts`
- `tests/e2e/questionnaire.spec.ts`
- `tests/e2e/admin-batch.spec.ts`
- `tests/e2e/results-export.spec.ts`
- `tests/load/concurrent-submit.mjs`
- `docs/runbooks/acceptance-checklist.md`

**步骤**

1. 端到端覆盖：建人员、建批次、分配任务、评分、进度、部分结果、完整结果、关闭、历史比较和导出。
2. 在 320/375/430px 移动视口验证六页问卷和大字体。
3. 验证 Android、iOS 和桌面主流浏览器的手工流程。
4. 模拟 20 名评分人同时提交；验证全部有效请求保存且无重复。
5. 模拟响应丢失后重试，确认返回原成功结果。
6. 检查键盘操作、焦点顺序、表单标签、错误提示和颜色对比。
7. 对蓝白雷达图、两页 PDF 和 Excel 数据做跨格式抽样核对。

**验证**

```powershell
npm.cmd run test:unit
npm.cmd run test:integration
npm.cmd run test:e2e
node .\tests\load\concurrent-submit.mjs --users 20
npm.cmd run build:all
npm.cmd run security:scan
```

**完成标准**：规格第 16 节所有验收项目有明确通过记录，没有高优先级缺陷。

### 任务 18：测试环境部署和用户验收

**外部前置条件**

- 用户已登录腾讯云。
- 创建独立 CloudBase 测试环境并提供环境 ID。
- 可管理测试域名或先使用 CloudBase 默认测试域名。

**步骤**

1. 部署 API、到期函数和备份函数到测试环境。
2. 创建集合、索引并种入题库 v1。
3. 在 CloudBase 控制台配置环境变量；避免 CLI 覆盖云端已有变量。
4. 配置 HTTP 网关路径和测试 CORS Origin。
5. 将测试 API 地址写入 EdgeOne 测试构建环境变量并部署测试前端。
6. 在 CloudBase 控制台核验三个函数、两个定时触发器、HTTP 路由和日志。
7. 使用虚拟人员完整运行一轮评估，执行 PNG/PDF/Excel 导出和备份恢复。
8. 用户按验收清单实际试用管理员端和手机评分端。

**完成标准**：用户验收测试环境，确认流程和报告内容可用于真实评估。

### 任务 19：生产部署、域名、回滚和交接

**新增/更新文件**

- `docs/runbooks/production-deploy.md`
- `docs/runbooks/rollback.md`
- `README.md`
- `docs/WORK_PROGRESS.md`

**步骤**

1. 在生产变更前导出现有能力图应用产物和配置备份。
2. 创建/核验生产 CloudBase 环境、集合、索引、题库和环境变量。
3. 先部署云函数但不公开问卷，运行健康检查和种子摘要核对。
4. 配置 `api.<主域名>` 的 CloudBase HTTP 网关、HTTPS 和允许 Origin。
5. 构建并部署 EdgeOne 前端，配置 `app.<主域名>`；需要大陆节点时先完成 ICP 备案。
6. 用匿名测试人员进行生产烟雾测试，然后清理测试批次。
7. 确认备份任务、到期任务和日志告警正常后再发布职位链接。
8. 回滚方案：前端回退上一 EdgeOne 部署；API 保留上一函数版本；数据库变更只做向前兼容，不在回滚中删除新集合。
9. 更新进度文档，记录生产域名、CloudBase 环境 ID、函数版本、部署时间和验收结果，但不记录秘密。

**完成标准**：七个职位长期链接可访问，真实提交可汇总，管理员可导出报告，且有可执行回滚和恢复手册。

## 5. 阶段门槛

### 阶段一：后端和共享核心（任务 0—9）

通过条件：题库、计分、任务、提交、管理鉴权、批次和结果 API 全部通过单元/集成测试。此时不对真实评分人开放。

### 阶段二：前端和导出（任务 10—14）

通过条件：评分端、管理端、能力图和三种导出能够使用内存或测试 API 完整运行。

### 阶段三：运维和安全（任务 15—17）

通过条件：定时关闭、备份恢复、安全扫描、20 人并发、移动端及跨格式验收全部通过。

### 阶段四：测试和生产部署（任务 18—19）

通过条件：用户先验收测试环境，再明确同意生产发布。

## 6. 实施过程中需要用户参与的节点

1. 任务 0：决定是否安装 Git/初始化仓库；未经确认不自动创建仓库。
2. 任务 4：用户创建或授权创建 CloudBase 测试环境。
3. 任务 7：用户设置管理员密码；密码不通过聊天或文档明文保存。
4. 任务 18：用户执行测试环境验收。
5. 任务 19：用户提供最终域名/DNS 控制权，并明确同意生产发布。

## 7. 最终完成定义

只有同时满足以下条件才视为实施完成：

- 规格范围内所有功能已实现。
- 自动化测试、生产构建、安全扫描和 20 人并发测试通过。
- 七职位 210 题题库摘要一致。
- 公开接口和匿名报告不泄露评分人身份。
- CloudBase 测试环境完成真实备份恢复演练。
- 用户验收测试环境并批准生产发布。
- EdgeOne 和 CloudBase 生产环境完成烟雾测试，回滚手册可执行。
