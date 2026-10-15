# AGENTS.md

Guga 课务（guga-timetable）—— 基于 `@homurajs` 六模块全家桶的教务管理系统。本文件帮助 Agent 快速定位代码结构与项目约定；产品/技术细节见 `docs/`。

## 概述

- **本项目是什么**：一个端到端的课务/教务后台。后端 Hono + `@homurajs/{core,app-kit,auth,license,db,storage}`，前端 React 19 + Vite 8 + shadcn/ui（Tailwind **v3**）。前后端同仓（monorepo 式单包），共享 `src/shared/domain.ts` 契约。
- **业务闭环**：课时余额是核心——缴费(订单)→充值余额，排课→点名(考勤)→扣减余额，成绩/档案围绕学员聚合。

## 边界与范围

- **范围内**：学员/教师/课程/班级/排课/考勤/成绩/订单/文件/仪表盘/RBAC 用户管理/授权状态展示。
- **非目标（明确排除）**：
  - 不接第三方 OAuth2 IdP（只走 `@homurajs/auth` 的 password provider）。
  - 不做真实支付（订单金额手动录入，单位「分」）。
  - 不做多租户 SaaS 隔离（storage ns 固定为 `guga`）。
  - 授权中心是**本地 mock**（`tools/genuine-mock.ts`），非生产中央服务。

## Agent 操作指南

### 如何理解本项目
- 先看 `docs/ARCHITECTURE.md`（结构）→ `src/shared/domain.ts`（领域契约：枚举/RBAC/zod schema/DTO，前后端同源）→ `src/server/index.ts`（六模块装配入口）。
- 后端每个资源三层：`repo/<x>.ts`（Drizzle 查询 + 业务）→ `api/<x>.ts`（Hono 路由 + 守卫）→ `api/index.ts`（组装挂 `/api`）。
- 前端每页：`pages/<x>.tsx` 用 `hooks/use-api.ts` 拉数据、`components/*` 复用、`lib/api.ts` 统一请求（含 401 自动 refresh、503 授权横幅）。

### 全局规则 / 约定（务必遵守）
- **端口**：API=`8799`，授权 mock=`8790`，Vite dev=`5173`。本机 `8787` 被其他 homura-genuine 服务占用，勿用。
- **相对 import 一律带 `.js` 后缀**（NodeNext/ESM），前端 tsx 亦然。
- **金额单位是「分」**（整数），显示用 `lib/utils.ts` 的 `formatMoney`（÷100）。时间是 epoch ms。
- **双方言 schema 必须同构**：改 `db/schema/sqlite.ts` 必同步 `db/schema/pg.ts`，列名/表名/主键一致（启动跑 `assertSchemaParity`，漂移即 fail-fast）。改完 `npm run db:generate` 生成迁移。
- **RBAC**：权限点 = `资源:动作`，角色→权限映射只在 `shared/domain.ts` 的 `ROLE_PERMISSIONS` 改。后端 `api/guards.ts` 的 `requirePerm/requireAdmin`，前端 `useAppStore().can()`。新增受保护路由两处都要加。
- **auth 的 users 表由库拥有、无 role 列**：教务角色存 `profiles` 表（userId 外键）。
- **`/files` 前缀被 app-kit SPA fallback 保留给存储代理**：客户端页面路由不得用 `/files`（资料库页是 `/library`）。保留前缀：`/api /auth /files /healthz /_healthz /_license`。
- 下载依赖走境内镜像（npmmirror / playwright cdn）；git 提交已禁用 GPG 签名（`commit.gpgsign=false`，本地 repo 级）。
- 提交信息遵循 Conventional Commits：type/scope 英文，描述中文，subject ≤72 字符，body 分点。

### 验收习惯
- 改动后跑 `npm run typecheck`（双 tsconfig）。前端改动 `npm run build:client`，后端 `npm run build:server`。
- 涉及业务流程的改动，尽量补/跑 `npm run test:e2e`（Playwright，打 dist 产物，需先 build）。

## 目录速查

- `src/shared/domain.ts` — 领域契约（枚举/RBAC/zod/DTO/节次定义），前后端同源
- `src/server/index.ts` — 六模块装配入口（createApp 中间件链）
- `src/server/env.ts` — `@homurajs/core` 配置装载（applyEnvFile + defineConfig）
- `src/server/db/` — `schema/{pg,sqlite}.ts` 双方言表、`tables.ts` 按方言选表、`index.ts` 建库+迁移
- `src/server/repo/` — 领域仓储（student/teacher/course/class/schedule/scheduleException/attendance/grade/order/file/profile/term）+ `base.ts`
- `src/server/service/` — `dashboard`（聚合）、`autoSchedule`（贪心+回溯自动派课）
- `src/server/api/` — Hono 路由（`crud.ts` 通用工厂、`guards.ts` 会话/RBAC、各资源路由、`scheduleExceptions.ts` 调换课、`terms.ts` 学期、`index.ts` 组装）
- `src/server/auth/` `license/` `storage/` — 三能力包的装配层
- `src/client/App.tsx` — 路由表 + 登录守卫
- `src/client/pages/` — 16 个业务页（含 timetable 三维度课表、schedule-adjust 调换课、auto-schedule 自动派课）
- `src/client/components/` — `layout/`（壳）、`ui/`（shadcn 生成）、复用件（form-dialog/data-table/stat-card/timetable-grid…）
- `src/client/{store,hooks,lib}/` — zustand 会话/授权、useApi/useOptions/useTerm、api 客户端+工具
- `scripts/` — `migrate` `seed` `genkeys` `gen-config` `reset-db`
- `tools/genuine-mock.ts` — 本地授权中心（Ed25519 签名，实现 license 契约端点）
- `drizzle/{sqlite,pg}/` — 迁移产物；`homura.config.env.example` — 配置模板
- `e2e/` — Playwright 规格（auth/academic/rbac-storage）+ `helpers.ts`
- `docs/` — PRD / ARCHITECTURE / DECISIONS / specs
