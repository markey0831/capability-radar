# 项目接管 / 换电脑继续指南

这份文档用于「换一台电脑也能直接继续」这个项目。源码已托管在 GitHub，部署配置和密钥因为安全原因不入仓库，需要按下面的步骤本地恢复。

## 1. 项目现状（第一版）

- 前端：单页应用，已可部署到任意静态托管（当前部署在 CloudBase 静态托管，长期域名备案后再切换）。
- 后端：腾讯云 CloudBase，3 个云函数 + 文档型数据库（FlexDB）。
- 数据库：10 个集合、15 个索引、题库 v1。
- 环境 ID：`bluefocus-d3grkg8s6e8a44be6`
- API 默认地址：`https://bluefocus-d3grkg8s6e8a44be6-1467982443.ap-shanghai.app.tcloudbase.com`
- 前端测试地址：`https://capability-radar-app-bluefocus-d3grkg8s6e8a44be6.webapps.tcloudbase.com/`

管理员密码：**不写入仓库**，以和用户的对话记录为准（第一版单一固定密码，二期再支持多账号）。

## 2. 哪些东西在 GitHub 上，哪些只在本地

在 GitHub 仓库 `https://github.com/markey0831/capability-radar` 里：

- 全部源码、测试、题库 JSON、索引声明（`cloudbase/indexes.json`）
- 示例配置：`cloudbaserc.example.json`、`.env.example`
- 部署进度文档：`docs/CLOUDBASE_DEPLOYMENT.md`

**不在仓库里（故意被 `.gitignore` 排除，换电脑必须手动恢复）：**

- `cloudbaserc.json`：环境 ID、云函数配置、函数环境变量（含管理员密码哈希、签名密钥等）
- `.env.cloudbase.local`：环境变量备份
- `cloudfunctions/*/index.js`：云函数构建产物（可用 `npm run build:functions` 重新生成）

## 3. 新电脑准备

1. 安装 Node.js 20.19+ 或 22.12+。
2. 安装 CloudBase CLI：

   ```powershell
   npm install -g @cloudbase/cli
   ```

3. 克隆仓库：

   ```powershell
   git clone https://github.com/markey0831/capability-radar.git
   cd capability-radar
   npm install
   ```

## 4. 恢复本地密钥（关键）

换电脑后，需要把旧电脑上的这两个文件复制过来（放在项目根目录）：

```text
cloudbaserc.json
.env.cloudbase.local
```

如果没有备份，也可以让我按以下方式重新生成（注意：重新生成管理员密码哈希会让旧密码失效，需要重新设置密码）：

- 用 `cloudbaserc.example.json` 复制出 `cloudbaserc.json`，填上环境 ID。
- 用 `scripts/generate-admin-password.mjs` 生成新的管理员密码盐和哈希。
- 其余签名密钥、备份密钥用随机值重新生成，并写入函数环境变量。

## 5. 构建

```powershell
npm run build:all
```

这会依次构建共享代码、三个云函数（生成 `cloudfunctions/*/index.js`）和前端 `dist`。

## 6. 本地运行（不接后端，纯演示）

```powershell
npm run dev
```

未配置 `VITE_API_BASE_URL` 时，前端自动用浏览器本地演示数据。管理员演示密码是 `admin123`。

## 7. 重新部署到 CloudBase（按需）

如果只是继续开发，通常不需要重新部署；只有改了后端代码或要重建线上环境时才需要：

```powershell
# 登录 CloudBase
cloudbase.cmd login

# 部署三个云函数（Event 类型）
cloudbase.cmd fn deploy capability-radar-api --dir ./cloudfunctions/api -e bluefocus-d3grkg8s6e8a44be6
cloudbase.cmd fn deploy capability-radar-close-expired --dir ./cloudfunctions/close-expired-batches -e bluefocus-d3grkg8s6e8a44be6
cloudbase.cmd fn deploy capability-radar-weekly-backup --dir ./cloudfunctions/weekly-backup -e bluefocus-d3grkg8s6e8a44be6

# 创建集合 / 索引 / 种入题库
node cloudbase/scripts/provision.mjs --env bluefocus-d3grkg8s6e8a44be6 --confirm-env bluefocus-d3grkg8s6e8a44be6
node cloudbase/scripts/seed-questionnaire.mjs --env bluefocus-d3grkg8s6e8a44be6 --confirm-env bluefocus-d3grkg8s6e8a44be6
```

索引需按 `cloudbase/indexes.json` 创建（服务端 SDK 无索引枚举接口）。

## 8. 常用命令备忘

```powershell
npm run test:run          # 运行测试
npm run build:all         # 构建全部产物
npm run security:scan     # 扫描构建产物中的敏感信息
cloudbase.cmd env list --json
cloudbase.cmd fn list -e bluefocus-d3grkg8s6e8a44be6 --json
```

> PowerShell 下 CloudBase CLI 使用 `cloudbase.cmd`，不要直接写 `cloudbase`。
