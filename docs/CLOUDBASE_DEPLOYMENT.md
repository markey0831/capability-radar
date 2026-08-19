# CloudBase 部署进度（第一版落地）

更新时间：2026-08-19（Asia/Shanghai）

## 一、目标

把「岗位六维能力图」项目部署到腾讯云 CloudBase，形成可访问的线上版本：

- 前端：已部署在 EdgeOne（临时预览地址，长期域名等备案后再接）。
- 后端：三个云函数部署到 CloudBase。
- 数据库：使用 CloudBase 文档型数据库（FlexDB / NoSQL），共 10 个集合、15 个索引，并种入题库 v1。

## 二、已完成

1. 已安装 CloudBase CLI（版本 3.7.3）。
   - PowerShell 下命令名是 `cloudbase.cmd`（不要直接写 `cloudbase`，可能触发执行策略报错）。
2. CLI 已登录，能正常列出环境。
3. 已创建正式配置 `cloudbaserc.json`，`envId = bluefocus-d9giiuwhtaa98ad92`。
4. 三个云函数 handler 已统一为 `index.main`，构建产物从 `dist/index.js` 调整为根目录 `index.js`。
5. 三个云函数已成功部署：
   - `capability-radar-api`
   - `capability-radar-close-expired`
   - `capability-radar-weekly-backup`

## 三、当前阻塞点（下次从这里继续）

当前环境 `bluefocus-d9giiuwhtaa98ad92` 是 **PostgreSQL-only（PG 模式）环境，没有文档型数据库实例**。项目后端完全依赖文档型数据库（`@cloudbase/node-sdk` 的 `database.collection(...)`），因此无法继续创建集合、种入题库和跑通线上接口。

腾讯云 `CreateTable` 接口返回的明确错误：

> This environment has no document database instance. It is provisioned with PostgreSQL instance [pgdb-b4xs2xeh], so document-database actions such as CreateTable are not available. Use the ExecutePGSql action...

诊断依据：

- `cloudbase env detail` 显示 `resources.databases = []`，同时 `PostgreSQL` 有实例 `pgdb-b4xs2xeh`。
- `DescribeEnvs` 返回 `Databases: []`、`PostgreSQL: [{Name: pgdb-b4xs2xeh}]`、`Meta` 含 `postgresql: enable`。
- 官方文档说明：环境运行模式（PG / 传统）在创建时确定，创建后不可切换；FlexDB 只能在创建环境时通过 `Resources` 勾选，事后无法补开。

## 四、下一步：需要用户先确认

两个可选方向：

1. 推荐：新建一个「传统模式」环境，勾选「文档型数据库（FlexDB）」。拿到新环境 ID 后重新部署三个云函数，再继续后续步骤。对现有代码零改动。
2. 不推荐：保留当前 PG 环境，把整个后端数据层从文档数据库改写成 PostgreSQL（SQL 建表 + 查询）。改动量很大，不适合第一版落地。

待用户确认后，继续执行：

1. 确认/新建含 FlexDB 的环境。
2. 创建 10 个集合（集合清单见 `cloudbase/indexes.json`）。
3. 种入题库 v1：`cloudbase/seed/questionnaire-v1.json`。
4. 配置 API 云函数环境变量。
5. 配置 CloudBase HTTP 访问路由（`/api` -> `capability-radar-api`），或部署为 HTTP Web Function。
6. 在控制台按 `cloudbase/indexes.json` 创建/核验 15 个索引。
7. 运行 `cloudbase/scripts/verify-environment.mjs` 做环境核验。

## 五、关键命令与路径

项目目录：

```text
C:\Users\15213\Desktop\python\capability-radar-app
```

常用命令（PowerShell）：

```powershell
# 查看环境列表
cloudbase.cmd env list --json

# 查看环境详情
cloudbase.cmd env detail -e <envId> --json

# 查看数据库命令帮助
cloudbase.cmd db nosql execute --help

# 部署云函数（在项目根目录执行）
cloudbase.cmd deploy
```

凭据位置（仅本地使用，禁止提交到代码库）：

```text
C:\Users\15213\.config\.cloudbase\auth.json
```

该文件里的临时凭据位于 `credential` 对象下：

- `credential.tmpSecretId`
- `credential.tmpSecretKey`
- `credential.tmpToken`

自定义脚本从环境变量读取凭据：

- `CLOUDBASE_SECRET_ID`
- `CLOUDBASE_SECRET_KEY`
- `CLOUDBASE_TOKEN`
- `CLOUDBASE_REGION=ap-shanghai`

读取凭据并注入环境变量的 PowerShell 示例（不打印密钥）：

```powershell
$auth = Get-Content 'C:\Users\15213\.config\.cloudbase\auth.json' -Raw | ConvertFrom-Json
$env:CLOUDBASE_SECRET_ID = $auth.credential.tmpSecretId
$env:CLOUDBASE_SECRET_KEY = $auth.credential.tmpSecretKey
$env:CLOUDBASE_TOKEN       = $auth.credential.tmpToken
$env:CLOUDBASE_REGION      = 'ap-shanghai'
```

## 六、已准备的辅助脚本

- `cloudbase/scripts/provision.mjs`：用 Node SDK 创建 10 个集合（当前环境无 FlexDB，会返回 `RESOURCE_NOT_FOUND`）。
- `cloudbase/scripts/seed-questionnaire.mjs`：种入题库 v1。
- `cloudbase/scripts/verify-environment.mjs`：核验集合与题库。
- `cloudbase/scripts/run-nosql.mjs`：本次新增，通过 `spawnSync` 调用 CLI，避免 PowerShell 传 JSON 参数时引号被吞的问题。

## 七、注意事项

- `cloudbaserc.json` 与全部密钥都不得提交到 Git 仓库。
- 管理员账号/多管理员体系已确认为二期需求，第一版继续使用单一固定密码。
- 长期域名待 ICP 备案后再接 EdgeOne；当前前端仍使用临时预览地址。

## 八、2026-08-19 进展与最新阻塞

1. 用户确认走「免费重建」路线后，已删除旧环境 `bluefocus-d9giiuwhtaa98ad92`（PG 模式、无文档数据库）。删除前已先删掉其中 3 个云函数。
2. 删除成功，当前账号下已无 CloudBase 环境。
3. 尝试用 CLI/API 新建「体验版」`baas_trial` 环境（含 `flexdb + storage + function`），多次重试均失败：

   > [CreateEnv] CreateDealError: 状态检查失败……超出操作次数限制

   判断为：该账号的「体验版」是一次性额度，已在此前创建 PG 环境时用掉，删除环境不会重置额度。
4. 新建付费「个人版」`baas_personal`（¥39.9/月）时返回「账户余额不足」。

## 九、最新状态（2026-08-19，已完成部署）

1. 用户在网页新建了可用环境：`bluefocus-d3grkg8s6e8a44be6`（体验版、ap-shanghai，含文档型数据库实例 `tnt-4s86ixkaa`，非 PG 模式）。
2. 修复了 node-sdk 写入格式 bug：`.set({ data: X })` 改为 `.set(X)`、`.update({ data: X })` 改为 `.update(X)`（否则文档会被包在 `data` 字段下，导致读取和唯一索引失败）。
3. 已部署 3 个云函数（Event 类型）：
   - `capability-radar-api`（HTTP 路由 `/` → 该函数）
   - `capability-radar-close-expired`（定时触发器，每 5 分钟）
   - `capability-radar-weekly-backup`（定时触发器，每周一 03:00）
4. 已创建 10 个集合、15 个索引。
5. 已种入题库 v1（7 个角色）。
6. 已配置函数环境变量（api 6 项、weekly-backup 1 项），密钥保存在 `.env.cloudbase.local`（已被 .gitignore 忽略）。
7. 已通过环境核验（10 集合可读、7 题库摘要一致）和冒烟测试（`/health` 返回 200，管理员登录返回 200）。

## 十、线上信息（第一版）

- 环境 ID：`bluefocus-d3grkg8s6e8a44be6`
- API 基础地址：`https://bluefocus-d3grkg8s6e8a44be6-1467982443.ap-shanghai.app.tcloudbase.com`
- 管理员密码：已生成并告知用户（仅以 scrypt 哈希形式保存在云端，明文不写入仓库）
- 前端待连接：需将 `VITE_API_BASE_URL` 设为上述 API 地址并重新部署前端；`ALLOWED_ORIGINS` 需包含最终前端域名。

## 十一、前端已连接（2026-08-19）

1. 已把 `VITE_API_BASE_URL` 注入前端构建（`cloudbaserc.json` 的 `app.envVariables`）。
2. 已重新部署到 CloudBase 静态托管，版本 `capability-radar-app-002`。
3. 验证通过：前端 JS 已包含 API 地址；`/health`、管理员登录/会话、`/admin/people`、公开问卷接口 `/public/questionnaire/sales` 均返回正常。

前端测试地址：

- 首页：`https://capability-radar-app-bluefocus-d3grkg8s6e8a44be6.webapps.tcloudbase.com/`
- 管理员：`https://capability-radar-app-bluefocus-d3grkg8s6e8a44be6.webapps.tcloudbase.com/admin`
- 问卷（销售示例）：`https://capability-radar-app-bluefocus-d3grkg8s6e8a44be6.webapps.tcloudbase.com/q/sales`

管理员密码：不写入仓库（第一版固定密码，见与用户的对话记录）。

## 十二、下一步

1. 当前已可先用默认域名完整跑通真实流程：管理员建人员 → 建批次 → 分配评分人 → 开放批次 → 评分人按岗位链接填问卷 → 后台看结果/导出。
2. 用户已确认：等长期域名 ICP 备案准备好后，再执行「正式域名切换 + 完整测试」。
3. 正式域名切换时要做：绑定已备案域名到 CloudBase HTTP 访问服务 / 前端托管；更新前端 `VITE_API_BASE_URL` 与 API 函数 `ALLOWED_ORIGINS` 为正式域名；重新构建部署前端。

备案前置提醒（供用户处理长期域名时参考）：

- CloudBase 环境备案需「标准版及以上 + 剩余有效期 ≥ 6 个月 + 开通云托管固定 IP」。
- 更省钱的替代方案：购买轻量应用服务器（3 个月起）作为备案资源，CloudBase 继续用个人版跑业务。
