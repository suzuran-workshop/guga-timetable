# Spec — 六模块集成契约（homura integration）

## 要构建什么

- 目标：把 `@homurajs` 的六个模块（core / app-kit / auth / license / db / storage）在同一个 Hono 应用里正确装配，形成一条职责清晰、顺序固定的中间件链，并保证形态（standalone / qw-pages）切换时业务代码零改动。

## 行为

装配顺序（`src/server/index.ts` 调 `createApp`，链序由 app-kit 固定）：

```
basePath → requestId+访问日志 → healthz → licenseGuard → sessionMiddleware
→ authRoutes(/auth/*) → App routes(/_license,/files,/api) → 静态(dist/client) → SPA fallback → onError
```

- **core**：启动即 `applyEnvFile` + `defineConfig().load()` 装载配置（fail-fast 校验密钥强度）；`createLogger` 输出 JSON lines；`detectRuntime`/`healthzPathFor` 决定形态相关常量。
- **db**：`createDatabase` 按 `DATABASE_URL` 选 pg/sqlite → `assertSchemaParity` → `runMigrations`；`initTables` 按方言选表引用。
- **auth**：`createAuth` 构造 drizzle stores + SessionManager + PasswordProvider + `createAuthRoutes`/`sessionMiddleware`/`requireAuth`，注入 `createApp({auth})`。
- **license**：`createLicense` 构造 LicenseClient（注册 + 心跳 + 验签）+ `licenseGuard`，注入 `createApp({license})`；`LICENSE_ENABLED=false` 时返回 null，跳过守卫。
- **storage**：`createStorage` 构造 local-fs FileStorage；`createFileProxyRoutes` 挂根级 `/files`。
- **app-kit**：`createApp` 组装上述 + 业务 `routes`；`adapter.start` 监听端口（standalone :8799 / qw-pages :8081+HOST）。

## 输入 / 输出

- 输入：`homura.config.env`（或真实 env）→ 类型化 AppConfig；Ed25519 公钥（验签）；genuine-mock 地址。
- 输出：一个监听端口的 Hono 应用，托管 SPA + API；`/healthz` 暴露 db+license 检查项。

## 约束

- **形态差异全走 adapter**：端口缺省、静态目录（dist/client vs client）、trustProxy（cookie Secure）、健康检查路径（/healthz vs /_healthz）——业务代码不得写 `if (qw-pages)`。
- **`HOMURA_RUNTIME=auto` 不是 detectRuntime 的合法 env 值**：走启发式探测前必须从 process.env 摘除，否则抛「非法值」。
- **健康检查路径三处同源**：app-kit 注册、license guard 豁免清单、SPA fallback 保留前缀都读 `healthzPathFor(target)`。
- **drizzle 精确版本**：orm 与 kit 同为 `1.0.0-rc.4`（auth/license/storage peer 精确锁）。

## 边界条件

- genuine-mock 不可达：license 注册失败 → fail-open 进宽限期（unknown/grace），心跳恢复后转 active；**不阻断启动**。
- 验签失败（公钥不符/篡改）：`onInvalidSignature:'suspend'` → 一律 suspended + enforcement all（安全边界不 fail-open）。
- 无静态产物（dev 模式）：`existsSync(assetsDir)` 为假 → 不挂 staticDir，前端由 Vite dev server 提供，API 走代理。
- license 停用 + enforcement=all：`/api/*` 全部 503，但 `/_license`、`/auth/*`、`/healthz` 仍可达（豁免清单）。

## 验收标准

- [x] 六模块在 `index.ts` 真实装配，启动日志逐模块可见（db parity / storage ready / auth / license verified / static mounted）。
- [x] standalone 形态：healthz=200、登录→API→静态→SPA fallback 全链路通（E2E 16 项）。
- [x] license active→suspended 切换：`/api` 200→503，`/_license`/`/healthz`/`/auth` 仍可达（手工集成测试）。
- [x] 验签 `getSignatureState()==='verified'`（E2E `授权状态端点`）。
- [x] 文件上传→代理下载→删除全链路（E2E `文件上传`，走 storage + /files 代理）。

## 完成定义

- 一条命令（`npm run preview` + genuine-mock）即可拉起完整应用；六模块各有 E2E 或集成测试覆盖其真实行为，而非仅 import 不报错。
