# ARCHITECTURE — 辰知教务

## 系统概述

单进程 Node 应用（Hono）同时托管**业务 API** 与**前端 SPA 静态产物**；前端在浏览器侧通过同源 fetch 调用 API。授权由一个独立的本地 genuine-mock 进程提供（Ed25519 签名）。`@homurajs/app-kit` 的 `createApp` 把所有能力装配成固定中间件链。

```
┌─────────────────────────────  浏览器 (React 19 SPA)  ─────────────────────────────┐
│  react-router 页面 ── zustand(store/app: user+license) ── lib/api(fetch,cookie)    │
│        │ 401→自动 /auth/refresh │ 503→授权横幅 │ RBAC can() 过滤菜单/按钮            │
└────────┼───────────────────────────────────────────────────────────────────────────┘
         │ 同源 HTTP（cookie 会话）
┌────────▼──────────────────────── Hono App（createApp 装配）─────────────────────────┐
│ 中间件链（app-kit 固定顺序）：                                                       │
│   basePath → requestId+访问日志 → healthz → licenseGuard → sessionMiddleware         │
│   → authRoutes(/auth/*) → App routes(/_license,/files,/api) → 静态(dist/client)      │
│   → SPA fallback → onError                                                          │
│                                                                                     │
│  /api/*  ── attachUser → requireLogin → requirePerm ──> repo 层 ──> Drizzle ──> DB   │
│  /files/* ──> @homurajs/storage 代理下载        /_license ──> LicenseClient 状态       │
└───────┬──────────────────┬───────────────────┬──────────────────┬───────────────────┘
        │                  │                   │                  │
   ┌────▼────┐       ┌─────▼─────┐       ┌─────▼──────┐     ┌─────▼──────┐
   │ db      │       │ auth      │       │ license    │     │ storage    │
   │ sqlite/ │       │ JWT会话   │       │ Client     │     │ local-fs   │
   │ pg      │       │ +profiles │       │(验签/心跳) │     │ data/      │
   │(drizzle)│       │           │       └─────┬──────┘     └────────────┘
   └─────────┘       └───────────┘             │ HTTP(register/heartbeat)
                                         ┌─────▼──────────────┐
                                         │ tools/genuine-mock │  ← @homurajs/license 契约
                                         │ :8790 Ed25519 签名  │    的本地中央授权服务
                                         └────────────────────┘
   core 贯穿全局：detectRuntime(形态) · defineConfig(配置) · createLogger(JSON日志) · healthzPathFor
```

## 核心模块

| 模块 | 职责 |
|------|------|
| `@homurajs/core` | 基座：形态探测(standalone/qw-pages)、配置装载(applyEnvFile+defineConfig)、结构化日志、TTL-KV、健康检查路径同源常量 |
| `@homurajs/app-kit` | 装配：`createApp` 固定中间件链、双形态 RuntimeAdapter(端口/静态目录/trustProxy)、静态托管 + SPA fallback |
| `@homurajs/db` | 持久层：Drizzle 双方言(node:sqlite/postgres)、schema-helpers 列配方、迁移、`assertSchemaParity` 同构校验 |
| `@homurajs/auth` | 认证：密码 provider、自管会话(HS256 短 JWT + opaque refresh rotate + 族吊销)、session 中间件、`/auth/*` 路由 |
| `@homurajs/license` | 授权：LicenseClient(注册/心跳/验签/状态机)、licenseGuard(停服守卫)、requireFeature(功能闸门)、`/_license` 状态端点 |
| `@homurajs/storage` | 对象存储：FileStorage 契约、local-fs 后端、`/files/<key>` 代理下载路由 |
| **业务层** | `repo/*`(Drizzle 查询+业务规则，含 term/scheduleException) · `api/*`(Hono 路由+RBAC 守卫) · `service/*`(dashboard 聚合、autoSchedule 贪心+回溯派课) |
| **前端** | `pages/*`(16 页) · `components/*`(layout/ui/复用件，含 timetable-grid) · `store`(zustand) · `hooks`(useApi/useOptions/useTerm) · `lib`(api/utils) |
| **契约** | `src/shared/domain.ts`：枚举/RBAC 映射/zod schema/DTO/节次定义/学期日期纯函数/排课例外类型，前后端同源 |

## 模块关系

- **core 是地基**：其余五模块与业务层都依赖它的配置/日志/形态常量；`healthzPathFor` 让 app-kit 注册路由、license guard 豁免清单、SPA fallback 保留前缀三处同源。
- **app-kit 是装配点**：`createApp({ auth, license, routes, staticDir, healthz })` 把各能力按固定链顺序组合；业务只填 `routes`。
- **auth 与业务 RBAC 解耦**：auth 的 `users` 表只管身份(username/nickname/avatar)，**无 role 列**；教务角色存业务侧 `profiles` 表(userId 外键)。`api/guards.ts` 的 `attachUser` 把 session claims 经 `ProfileRepo` 扩展成含 role+permissions 的 `SessionUser`。
- **license 独立于业务**：guard 在中间件链中先于业务路由，按 `getStatus()/getEnforcement()` 处置；豁免 healthz + `/auth/*` + `/_license`，保证停服时登录链与状态页仍可达。
- **db 双方言对称**：`tables.ts` 按运行时 dialect 选 pg/sqlite schema，业务 repo 只面对统一表引用（`DrizzleQueryable` 收口，规避「db方言×table方言」类型爆炸）。

## 数据流

**典型写请求（如「考勤点名」）：**
1. 浏览器 `lib/api` POST `/api/attendance/mark`（cookie 会话）。
2. 链：requestId → healthz(跳过) → **licenseGuard**(active 放行) → **sessionMiddleware**(JWT 验签→claims) → 业务路由。
3. `attachUser`(claims.sub → ProfileRepo → SessionUser) → `requireLogin` → `requirePerm('attendance:write')`。
4. zod 校验 body → `AttendanceRepo.markBatch`：对每个学员 upsert 考勤，出勤/迟到/补课则 `UPDATE students SET balanceLessons = MAX(0, balance - consume)`（改判回滚差额）。
5. Drizzle → node:sqlite 落库 → 返回 JSON → 前端 `useApi.reload()` 刷新。

**课时余额闭环**：`订单(paid) → balance += lessons`；`考勤(present/late/makeup) → balance -= consumed`；`退款 → balance -= lessons(floor 0)`。余额是跨订单/考勤两模块的共享状态，全部经 repo 层的原子 SQL 表达式维护。

## 外部系统

- **genuine-mock 授权中心**（`tools/genuine-mock.ts`，:8790）：实现 `@homurajs/license` 契约的 `/v1/{register,heartbeat,keys}`，用 `tools/.keys/private.pem`(Ed25519) 对 entitlement 签名；消费侧用配套公钥验签。环境变量切换 active/suspended/expired 与 enforcement，用于演示守卫处置。**生产应替换为供应方的真实中央授权服务。**
- **无其他外部依赖**：不对接支付网关、短信、第三方 IdP；文件落本地磁盘。

## 重要技术边界

- **形态（runtime）**：`HOMURA_RUNTIME=auto` 时按注入标记探测；standalone 用 `/healthz`、`dist/client`、cookie Secure 跟随 `TRUST_PROXY`；qw-pages 用 `/_healthz`、`client`、Secure 恒 true。业务代码零 if-else，差异全走 adapter。
- **`/files` 前缀归存储代理**：app-kit 的 SPA fallback 把 `/files` 列为保留前缀（回 404 JSON 而非 index.html），故客户端「资料库」页路由是 `/library`，`/files/<key>` 专供下载。
- **schema 漂移即崩**：启动跑 `assertSchemaParity(pgSchema, sqliteSchema)`，表名/列名/主键不一致直接 fail-fast——避免上线后双方言行为分叉。
- **drizzle 版本钉死**：`drizzle-orm` 与 `drizzle-kit` 必须同为 `1.0.0-rc.4`（auth/license/storage 的 peer 精确锁此版；kit 版本不匹配会拒绝生成迁移）。
- **金额/时间表示**：金额一律整数「分」，时间一律 epoch ms（`bigint`/`integer`，双方言原生 SQL 读写一致；node:sqlite 不接受 Date 对象）。
- **授权 fail-open**：注册/心跳网络失败不抛错、不改已确认状态，仅推进宽限期计时（ADR 精神：短暂失联不该误伤正常用户）；但**验签失败一律 suspended**（安全边界不可 fail-open）。注册失败也不崩——后台每 15s 重试 register，授权中心起来后自动激活（`startRegisterRetry`），无需重启业务服务。
- **排课两层模型**：循环排课（`schedules`，按周重复：weekday+节次+周段）与例外层（`schedule_exceptions`，针对**具体某一次课**：cancelled/moved/substituted）分离。单日实际课次由 `resolveDay(date)` 叠加解析：循环排课命中该天 − 移出/取消 + 调入（含代课覆盖教师）。调换课只写例外，**不改循环排课本体**——学期内其余周次不受影响。「对调」= 两条互指对方日期的 moved 例外（交换节次、各留教室）。
- **学期是时间锚点**：`terms.startDate` 经 `startOfWeekMonday` 规整为周一，保证 `weekOfDate`/`dateOfWeekday` 往返一致（非周一锚点会错位一天）。课表周次、调换课日期解析、自动派课周段全部依赖当前学期；无当前学期时课表回退第 1 周并给 UI 提示。日期↔教学周是 `shared/domain.ts` 的**纯函数**，前后端同源、17 项单测锁定。
- **自动派课 = 贪心 + 回溯**：任务展开（每班 N 次课）→ 候选时段枚举（period-major 排序，使同班课次分散到不同天）→ 回溯搜索（内存虚拟占位参与冲突检测，复用三维相交语义：教室∪教师∪同班 × 节次 × 周段）→ **all-or-nothing 落库**（排不全则一节不落库，全部记失败并给放宽建议）。回溯超上限（默认 20000）提前终止防爆炸。不追求全局最优（那是 CSP/求解器的范畴，见 PRD 非目标）。
