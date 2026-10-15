# Guga 课务（Guga Timetable）

> 基于 [@homurajs](https://www.npmjs.com/org/homurajs) 全家桶构建的教务管理系统（Academic Affairs Management System），UI/UX 采用 Vite 8 + React 19 + shadcn/ui（Tailwind v3）。本项目是对知名课务软件「Guga 课务」的致敬式复刻与再实现。

## 这是什么？

- **定位**：面向中小型培训机构 / 教务部门的「学员—教师—课程—班级—排课—考勤—成绩—收费」一体化后台。
- **解决的核心问题**：把分散在 Excel 里的课务数据收敛成结构化系统，并以**课时余额**为核心贯穿「缴费 → 排课 → 点名 → 扣课时」的业务闭环。
- **技术展示价值**：完整、真实地用上 `@homurajs` 的六个模块（core / app-kit / auth / license / db / storage），是这套 SDK 的一个端到端参考实现。

## 为什么存在？

- 作为 `@homurajs` 全家桶的落地示范：六个能力包如何在同一个 Hono 应用里协同装配。
- 复刻「Guga 课务」这类课务软件的核心交互（尤其是**周课表网格**与**考勤点名**），验证 shadcn/ui + Tailwind v3 在信息密集型后台场景的表现力。

## 如何安装和运行？

### 前置要求

- **Node.js ≥ 22.5**（`@homurajs/db` 的 `node:sqlite` 依赖；实测于 Node 26）。
- npm（已配置 `.npmrc` 指向 npmmirror 境内镜像）。
- 国内网络下 Playwright 浏览器下载建议走镜像（见下）。

### 安装步骤

```bash
npm install

# 1) 生成开发配置（从 example 派生 homura.config.env，注入授权公钥、改用空闲端口）
npm run genkeys        # 生成 Ed25519 密钥对（授权验签用，仅首次）
npx tsx scripts/gen-config.ts   # 写出 homura.config.env

# 2) 建库 + 灌入演示数据（幂等）
npm run db:migrate
npm run db:seed        # 创建 admin 账号 + 4课程/4教师/4班级/10学员/订单/考勤/成绩
```

### 运行 / 启动

**生产形态（单进程，app-kit 托管 dist/client）：**

```bash
npm run build          # 构建前端(dist/client) + 后端(dist/server)

# 终端 A：本地授权中心（@homurajs/license 的 genuine-mock）
npm run dev:genuine

# 终端 B：业务服务（默认 http://127.0.0.1:8799）
npm run preview
```

打开 <http://127.0.0.1:8799>，演示账号：**admin / guga@2025**。

**开发形态（Vite HMR + tsx watch，前后端分离）：**

```bash
npm run dev:genuine    # 终端 A：授权中心 :8790
npm run dev            # 终端 B：并发拉起 API(:8799 tsx watch) + Web(:5173 Vite，代理到 API)
```

开发时访问 <http://127.0.0.1:5173>（Vite 会把 `/api`、`/auth`、`/files`、`/_license`、`/healthz` 代理到后端）。

### 端到端测试

```bash
npm run build          # E2E 打 dist 产物，需先构建
npm run test:e2e       # Playwright（24 项，真实 Chromium；webServer 自动拉起授权中心+API+种子）
```

> 首次运行需 `npx playwright install chromium`；境内网络建议
> `PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright npx playwright install chromium`。

## 当前状态

- **阶段**：功能完整的可运行原型（16 个业务页 + 六模块后端全部接通，32 项单测 + 24 项 E2E 全绿）。
- **已知限制**：
  - 授权中心为**本地 genuine-mock**（`tools/genuine-mock.ts`），非生产级中央授权服务；生产应对接供应方的 homura-genuine。
  - 对象存储用 **local-fs** 后端（`data/storage`）；切 S3/supabase 只需替换 `src/server/storage/index.ts`。
  - 默认 **sqlite** 单机形态；pg 形态的 schema/迁移已就绪（`drizzle.pg.config.ts`），但未在真实 PG 上跑过集成。
  - **自动派课是贪心+回溯的可行解，非全局最优**（不含教师时间偏好、连堂硬约束、跨班均衡等 CSP 级约束）；手动排课+冲突校验仍是主路径。
  - 演示用的种子数据与 `AUTH_SECRET` 缺省值仅供开发，生产必须覆盖（`loadConfig` 在 `NODE_ENV=production` 下会拒绝 dev 缺省密钥）。

## 核心技术

| 层 | 选型 |
|----|------|
| 前端 | React 19 · Vite 8 · shadcn/ui · Tailwind CSS **v3** · react-router 7 · zustand · react-hook-form + zod · recharts · TanStack Table · lucide-react · sonner · next-themes |
| 后端 | Hono · `@homurajs/app-kit`（createApp + 双形态 adapter） |
| 六模块 | `@homurajs/core` · `app-kit` · `auth` · `license` · `db` · `storage` |
| 持久层 | Drizzle ORM `1.0.0-rc.4`（node:sqlite / postgres 双方言）· drizzle-kit |
| 测试 | Playwright（E2E）· Vitest（单测占位） |
| 语言 | TypeScript 5.9（严格模式，前后端双 tsconfig） |

详细设计见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)，产品需求见 [`docs/PRD.md`](docs/PRD.md)，关键取舍见 [`docs/DECISIONS.md`](docs/DECISIONS.md)。
