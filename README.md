# 岗位六维能力图（多评分人问卷系统）

面向岗位六维能力评估的一体化应用：管理员维护人员、批次和评分任务；评分人按岗位链接匿名填写六维问卷；系统自动评分、汇总并导出报告。

## 技术架构

- 前端：Vite + TypeScript 单页应用
  - `/`：旧版单机能力图
  - `/q/:roleCode`：评分人问卷（按姓名 + 部门匹配预分配任务）
  - `/admin`：管理员后台（密码登录）
- 后端：腾讯云 CloudBase（云函数 + 文档型数据库 FlexDB）
  - `capability-radar-api`：HTTP API（公开问卷 + 管理接口）
  - `capability-radar-close-expired`：定时关闭到期批次（每 5 分钟）
  - `capability-radar-weekly-backup`：每周加密备份
- 数据库：10 个集合、15 个索引；题库 v1（7 个岗位 × 6 维度 × 5 题）

## 本地运行（演示模式，无需后端）

需要 Node.js 20.19+ 或 22.12+。

```powershell
npm install
npm run dev
```

默认访问 `http://localhost:5173`。未配置 `VITE_API_BASE_URL` 时，前端自动使用浏览器本地演示数据（`localStorage` 持久化）。

- 管理员演示入口：`http://localhost:5173/admin`，演示密码 `admin123`
- 问卷示例：`http://localhost:5173/q/sales`

7 个岗位代码：`sales`、`business`、`project-manager`、`technical-delivery`、`offline-operations`、`ip-operations`、`content-distribution`

## 构建与测试

```powershell
npm run test:run
npm run build:all      # 构建共享代码 + 三个云函数 + 前端
npm run security:scan
```

## 部署与换电脑继续

完整的环境搭建、CloudBase 部署、密钥恢复以及「换电脑继续」的操作步骤，见：

- `docs/CLOUDBASE_DEPLOYMENT.md`
- `docs/ONBOARDING.md`
