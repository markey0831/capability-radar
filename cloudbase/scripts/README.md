# CloudBase 初始化脚本

这些脚本只读取本机已登录的 CloudBase CLI/SDK 凭据，不接收或打印密钥。

```powershell
node .\cloudbase\scripts\provision.mjs --env <测试环境ID> --confirm-env <测试环境ID>
node .\cloudbase\scripts\seed-questionnaire.mjs --env <测试环境ID> --confirm-env <测试环境ID>
node .\cloudbase\scripts\verify-environment.mjs --env <测试环境ID>
```

`provision.mjs` 负责幂等创建 10 个集合。当前 `@cloudbase/node-sdk` 提供 `createCollection`，但不提供服务端索引管理方法，因此索引需在 CloudBase 控制台依据 [indexes.json](../indexes.json) 创建。

生产环境默认被拦截。确需初始化生产环境时，除了环境 ID 双重确认还要加 `--allow-production`，并应先备份和人工复核目标环境。

部署函数使用 CloudBase CLI 2.12 或更高版本；旧版本部署可能覆盖控制台中已有的环境变量。真实 `cloudbaserc.json` 和全部密钥都不得提交到代码库。
