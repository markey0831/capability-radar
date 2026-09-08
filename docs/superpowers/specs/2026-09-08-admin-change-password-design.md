# 管理员自助修改密码 - 设计说明

日期：2026-09-08

## 目标

让管理员在后台自助修改登录密码，不再需要命令行和控制台手动更新环境变量。

## 方案

采用「密码哈希存入数据库 + 后台修改密码接口」的方式：

- 新增集合 `admin_settings`，文档 `_id = admin_password`，字段为 `saltHex`、`hashHex`、`updatedAt`。
- 云函数首次登录/校验时，若数据库中没有该文档，则用现有环境变量中的盐和哈希自动初始化，实现平滑迁移。
- 登录改为从数据库读取密码并校验。
- 新增接口 `POST /admin/change-password`：
  - 需已登录（会话 + CSRF + Origin 校验）。
  - 请求体 `{ currentPassword, newPassword }`。
  - 校验当前密码，新密码至少 12 位，生成新盐 + scrypt 哈希后写入数据库。
- 后台增加「修改密码」导航和表单，填写当前密码、新密码、确认新密码后提交。

## 涉及文件

后端：

- `cloudfunctions/api/src/repositories/contracts.ts`
- `cloudfunctions/api/src/repositories/cloudbase/admin-settings-repository.ts`
- `cloudfunctions/api/src/admin/auth.ts`
- `cloudfunctions/api/src/index.ts`
- `cloudbase/indexes.json`

前端：

- `src/admin/admin-api.ts`
- `src/admin/admin-app.ts`

## 验证

- 用当前密码登录成功。
- 修改密码接口返回成功。
- 当前密码错误时返回 401。
- 修改后新密码登录成功、旧密码失效。
