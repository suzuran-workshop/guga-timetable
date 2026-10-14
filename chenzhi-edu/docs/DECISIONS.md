# DECISIONS

本项目关键取舍的记录（ADR 风格）。每条含背景、方案、决策与后果，便于后来者理解「为什么是这样」。

## ADR-001：六模块全用，而非只用 app-kit

- 日期：2026-10-14
- 状态：已采纳
- 背景：用户要求「用 @homurajs/app-kit 做一个应用（几个模块应用尽用）」。`@homurajs` scope 下有六个包：core / app-kit / auth / license / db / storage。
- 考虑过的方案：(A) 只用 app-kit + 自写鉴权/持久化；(B) 六模块全部真实接入。
- 决策：**选 B**，六模块全部真实装配并跑通，而非摆设。
- 为什么：用户明确要「应用尽用」；且六模块本就为协同设计（core 是地基、app-kit 是装配点），全用才能体现 SDK 价值，也是最好的端到端验证。
- 后果：需自建本地 genuine-mock 授权中心（license 依赖中央服务）、双 schema 维护（db 双方言）、profiles 表补 RBAC（auth users 无 role）。复杂度上升但每层都真实可用。
- 何时重新审视：若 SDK 提供官方 mock/沙箱授权中心，可替换 tools/genuine-mock.ts。

## ADR-002：授权中心用本地 genuine-mock + Ed25519 真实验签

- 日期：2026-10-14
- 状态：已采纳
- 背景：`@homurajs/license` 的 LicenseClient 需对接 homura-genuine 中央授权服务（注册/心跳/验签），但本项目无真实中央服务。
- 考虑过的方案：(A) `LICENSE_ENABLED=false` 跳过守卫；(B) 写一个假的 client 桩；(C) 实现一个符合契约、真实签名的本地 mock 服务。
- 决策：**选 C**。`tools/genuine-mock.ts` 用 Hono 实现 `/v1/{register,heartbeat,keys}`，`scripts/genkeys.ts` 生成 Ed25519 密钥对，mock 用私钥对 `canonicalize(entitlement)` 签名，消费侧用公钥 `verifyEntitlement`。
- 为什么：选 A/B 会让 license 模块形同虚设，无法验证「验签→采信 features→守卫处置」的真实链路。真实签名才能跑通 `getSignatureState()==='verified'` 与 suspended→enforcement 处置。
- 为什么不选其他：桩实现绕过了密码学，掩盖了 canonicalize/keyId/PEM 规范化等真实坑点。
- 后果：完整演示了 active/suspended/expired × none/notice/core/all 的守卫行为；E2E 可断言 `/_license` 的 verified 状态。私钥入 `.gitignore`。
- 何时重新审视：接入供应方真实 homura-genuine 时，仅需改 `GENUINE_SERVER` 与公钥，业务代码零改动。

## ADR-003：教务角色存 profiles 表，不扩 auth 的 users 表

- 日期：2026-10-14
- 状态：已采纳
- 背景：RBAC 需要 role，但 `@homurajs/auth/tables` 的 `users` 表由库拥有，列为 id/username/nickname/avatar_url，**无 role**，且不应改库拥有的表。
- 考虑过的方案：(A) 往 users 表加列；(B) 业务侧建 profiles 表，userId 外键关联。
- 决策：**选 B**。`profiles(userId PK, role, realName, phone, teacherId)`，`ProfileRepo.resolveSessionUser` 把 session claims(sub=userId) join users+profiles 得到含 role+permissions 的 SessionUser。
- 为什么：不侵入 SDK 拥有的表，保持 auth 模块可升级；角色是业务概念，归业务层。
- 后果：新注册用户无 profile 行 → 缺省 viewer 角色（最小权限），需 admin 在设置页提升。首个种子 admin 由 seed 脚本显式建 profile。
- 何时重新审视：若 auth 未来原生支持 role/claims 扩展，可合并。

## ADR-004：双方言 schema + 启动期 parity 校验

- 日期：2026-10-14
- 状态：已采纳
- 背景：`@homurajs/db` 支持 node:sqlite（单机）与 postgres（生产）双方言，auth/license 也提供 `pg*Tables`/`sqlite*Tables` 两套。
- 考虑过的方案：(A) 只支持 sqlite；(B) 双方言各写一份 schema，启动跑 `assertSchemaParity` 校验同构。
- 决策：**选 B**。`db/schema/{pg,sqlite}.ts` 用 `@homurajs/db/schema-helpers` 的列配方对称定义，`tables.ts` 按运行时 dialect 选表，启动即 parity 校验（表名/列名/主键）。
- 为什么：SDK 的设计意图就是双方言可切换；parity 校验让 schema 漂移 fail-fast，而非上线后 pg/sqlite 行为分叉。
- 后果：每张业务表写两遍（11 表）；索引用 builder API（`.on(t.col)`）而非裸 SQL 字符串，避免列名 camelCase/snake_case 不一致。drizzle-kit 需把 auth/license 内置表逐个再导出（只 spread 进聚合对象扫描不到）。
- 何时重新审视：确定只跑单一方言时，可删另一方言减负担。

## ADR-005：drizzle-orm/kit 钉死 1.0.0-rc.4

- 日期：2026-10-14
- 状态：已采纳
- 背景：auth/license/storage 的 peerDependencies 精确要求 `drizzle-orm: 1.0.0-rc.4`（非 ^range）。
- 决策：`drizzle-orm` 与 `drizzle-kit` **都钉 `1.0.0-rc.4`**。
- 为什么：kit 0.31.x 会因「版本旧于 orm rc」拒绝生成迁移；两者必须同 rc 版。peer 精确锁，浮动会装不上或类型不匹配。
- 后果：升级需六模块与 drizzle 协同升级；`package.json` 用精确版本号（无 ^）。
- 何时重新审视：homurajs 发布稳定版 drizzle 依赖时。

## ADR-006：Tailwind v3（非 v4）+ shadcn cssVariables

- 日期：2026-10-14
- 状态：已采纳
- 背景：用户指定 shadcn/ui（TW3）。shadcn CLI 默认可能拉 TW4（`@theme` 语法）。
- 决策：`tailwindcss@3.4.19` + `tailwind.config.ts`（content/darkMode:class/plugins）+ `components.json` 设 `cssVariables:true` + `tailwindcss-animate`，产出经典 TW3 组件（`bg-primary`、HSL 变量）。
- 为什么：忠实满足「TW3」要求；TW3 生态成熟、与 shadcn new-york style 契合。
- 后果：设计令牌走 `index.css` 的 `:root`/`.dark` HSL 变量；`darkMode:['class']` 由 next-themes 挂 `.dark`。
- 何时重新审视：用户改要求 TW4 时（需迁 `@theme` 语法与 shadcn TW4 组件）。

## ADR-007：客户端资料库页用 /library，避开 /files 保留前缀

- 日期：2026-10-14
- 状态：已采纳
- 背景：app-kit 的 SPA fallback 把 `/files` 列为保留前缀（命中即回 404 JSON，不回 index.html），因为 `/files/<key>` 是 storage 代理下载的统一入口。E2E 实测 `goto('/files')` 得到 `{"error":"not_found"}` 而非 SPA。
- 考虑过的方案：(A) 改 app-kit 保留前缀（不可，库拥有）；(B) 客户端页面改用 `/library` 路由。
- 决策：**选 B**。资料库页路由 `/library`，`/files/*` 专供对象存储代理下载。
- 为什么：尊重 SDK 的路由契约（`proxyUrl` 固定 `/files/<key>`）；前端路由避开所有保留前缀（/api /auth /files /healthz /_healthz /_license）。
- 后果：侧边栏「资料库」链接到 `/library`；已加 CI 检查（App.tsx 路由不得撞保留前缀）。
- 何时重新审视：无（这是 SDK 硬约束）。

## ADR-008：E2E 用 Playwright 打 dist 产物，webServer 自动编排

- 日期：2026-10-14
- 状态：已采纳
- 背景：验收标准要求高覆盖率 E2E。需真实浏览器 + 真实六模块后端。
- 决策：Playwright（Chromium），`webServer` 命令先幂等 `seed.ts` 再 `concurrently` 拉起 genuine-mock(:8790) + `node dist/server/index.js`(:8799)，测试打生产形态产物。16 项覆盖认证/RBAC/学员CRUD/班级/排课冲突/考勤消课/订单充值/文件存储/授权状态。
- 为什么：打 dist 验证的是真实交付物（含 app-kit 静态托管 + SPA fallback），而非 dev server 的理想态；webServer 自动编排免手动起服务。
- 后果：跑 E2E 前需 `npm run build`；测试串行（workers:1，共享 DB 避免竞争）；用唯一后缀/日期保证幂等重跑。表单控件加 `htmlFor`+`id` 关联（既是 a11y 也便于 `getByLabel`）。
- 何时重新审视：引入测试隔离（每测试独立 DB）后可并行。

## ADR-009：金额用整数「分」、时间用 epoch ms

- 日期：2026-10-14
- 状态：已采纳
- 背景：金额浮点会丢精度；node:sqlite 不接受 Date 对象，双方言时间表示需统一。
- 决策：金额一律整数**分**（显示用 `formatMoney` ÷100）；时间一律 **epoch ms**（schema 用 `epochMs` 列配方：pg bigint / sqlite integer）。
- 为什么：整数分杜绝浮点误差；epoch ms 让原生 SQL 读写双方言一致（`@homurajs/db` schema-helpers 的设计意图）。
- 后果：所有金额字段语义是「分」，seed/UI/API 三处对齐；订单 amount、课程 pricePerLesson 皆是。
- 何时重新审视：无（财务系统标准实践）。
