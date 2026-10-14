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

## ADR-010：排课用「循环 + 例外」两层模型实现调换课

- 日期：2026-10-14
- 状态：已采纳
- 背景：原排课是「按周循环」模型（weekday+节次+周段），没有「某一次课」的概念。而调换课（停课/代课/对调）针对的是**具体日期的那一次课**——在循环模型里根本无处安放。
- 考虑过的方案：(A) 给 schedules 加 date 列，每次课一行（彻底改成实例化模型）；(B) 保留循环排课本体，另建 `schedule_exceptions` 例外层，按 (scheduleId, originalDate) 定位单次课施加变更，读取时叠加解析。
- 决策：**选 B**。`resolveDay(date)` = 循环排课命中该天 − 移出/取消 + 调入（代课覆盖教师）。调换课只写例外，不动循环本体。
- 为什么：选 A 要把 1 条循环排课炸成 N 条周实例（20 周 = 20 行），改课程/教师得改 N 行，且「每周重复」这一教务核心语义丢失。B 保持循环排课的紧凑表达，例外是稀疏叠加，学期内其余周次天然不受影响。
- 为什么不选其他：实例化模型存储与一致性成本高，且与「按周循环」的用户心智不符。
- 后果：单日课表必须经 `resolveDay` 解析（不能直接读 schedules）；「对调」实现为两条互指对方日期的 moved 例外（交换节次、各留教室）；例外表 (scheduleId,originalDate,action) 唯一。9 项单测锁定解析语义。
- 何时重新审视：若需要「整周批量调课」或「例外再排课」的复杂叠加，可能需要更结构化的例外模型。

## ADR-011：自动派课用贪心 + 回溯，不引入约束求解器

- 日期：2026-10-14
- 状态：已采纳
- 背景：用户要自动派课，并选定「贪心 + 冲突回溯」策略。
- 考虑过的方案：(A) 贪心 + 回溯（内存搜索）；(B) 建模为 CSP 用求解器（如 javascript-lp-solver / OR-tools wasm）。
- 决策：**选 A**。任务展开 → 候选时段枚举（period-major 排序）→ 回溯搜索（内存虚拟占位参与冲突检测）→ all-or-nothing 落库。
- 为什么：教务规模（几十班 × 每天十几节）下回溯足够快（实测 12 节 0 回溯 18ms；不可行场景 20000 回溯上限 84ms 终止）；结果可解释、零重依赖；冲突判定复用已有的三维相交语义，与手动排课一致。
- 为什么不选其他：求解器追求全局最优，但引入重依赖与建模复杂度，收益不抵成本（PRD 已把「最优 CSP」列为非目标）；贪心+回溯给的是**可行解**，满足「无冲突地排开」这一核心诉求。
- 后果：period-major 排序使同班课次分散到不同天（如周二+周四同时段），符合教务习惯；搜不出完整解时**一节都不落库**（all-or-nothing），全部记失败并提示放宽约束；回溯超上限提前终止防爆炸。6 项单测覆盖可行/分散/共享教师回溯/既有障碍/不可行/教室池。
- 何时重新审视：当需要教师时间偏好、连堂硬约束、跨班最优均衡等复杂约束时，再评估 CSP/求解器。

## ADR-012：学期 startDate 强制规整到周一

- 日期：2026-10-14
- 状态：已采纳
- 背景：日期↔教学周的所有纯函数（weekOfDate/dateOfWeekday/weekStartDate）都以 termStart 为「第 1 周周一」锚点。若管理员误填非周一（如周二），往返换算会整体错位一天（实测：date→(week,weekday)→date 回不到原日期）。
- 考虑过的方案：(A) 校验拒绝非周一，要求用户改；(B) 建/改学期时用 `startOfWeekMonday` 静默规整到所在周周一。
- 决策：**选 B**。TermRepo.create/update 一律 `startOfWeekMonday(startDate)`，UI 提示「非周一会自动规整」。
- 为什么：选 A 把负担推给用户且易困惑（「为什么必须是周一」）；B 保证不变量恒成立，纯函数可安全假设锚点是周一。
- 后果：学期起点永远是周一；17 项日期单测含 `startOfWeekMonday` 规整与往返一致性；前端 `currentWeekFor` 与后端 `weekOfDate` 同算法（shared 纯函数），不会漂移。
- 何时重新审视：若支持「学期从周日开始」等异构校历，需把锚点 weekday 参数化。

## ADR-013：自动派课契约收口到 shared/domain.ts（消灭前后端副本）

- 日期：2026-10-14
- 状态：已采纳
- 背景：`AutoScheduleRequest` / `AutoScheduleResult` 原先定义在 `src/server/service/autoSchedule.ts`（后端），而前端 `pages/auto-schedule.tsx` 手抄了一份 `AutoResult` 接口。两份定义**结构相同但无编译期关联**——任一侧改字段名，另一侧不会报错，只会在运行时表现为「结果面板显示 undefined」。这违背本项目头号约定（AGENTS.md：`shared/domain.ts` 前后端同源）。发现于验证阶段：前端文件里那句注释「与后端 AutoScheduleResult 对齐」恰恰暴露了它靠人工对齐。
- 考虑过的方案：(A) 保持现状，靠注释与人工纪律；(B) 前端 `import type` 后端 service 的类型；(C) 把契约搬到 `shared/domain.ts`，前后端都从那里导入。
- 决策：**选 C**。`ScheduleSlot` / `AutoScheduleRequest` / `AutoScheduleResult` 定义在 `shared/domain.ts`；后端 service 只保留 `type Slot = ScheduleSlot` 本地别名（避免大改内部实现），`api/schedules.ts` 与前端页面均改从 shared 导入。
- 为什么不选其他：A 把类型安全退化成人工纪律，且已经发生过一次「注释代替契约」；B 让前端 import 后端目录，跨层依赖、把 service 的内部类型泄漏成公共契约（service 里的 `Slot`/`Task` 是内部实现细节，不该被前端看见）。
- 后果：改契约只改一处，编译期即锁定前后端一致。**用变异测试验证过约束真的生效**——把 shared 的 `backtracks` 改名后，前端 `tsc` 立刻报 `TS2339: Property 'backtracks' does not exist`（收口前不会报错）。同时把 `AutoScheduleResult` 的 all-or-nothing 语义（`ok=false` 时 `placed` 恒为空）写进了契约注释，使其成为显式承诺而非实现巧合。
- 何时重新审视：若后续按端点批量提取契约，可考虑用 zod schema 统一「校验 + 类型」两层（目前 request 侧仍是手写校验，见 api/schedules.ts）。

## ADR-014：已有当前学期时，新建学期不默认夺权

- 日期：2026-10-14
- 状态：已采纳
- 背景：「新建学期」对话框原先无条件默认 `isCurrent: true`。由于当前学期是全局**时间锚点**（课表周次、调换课日期解析、自动派课周段都依赖它），这等于「建一个下学期计划」会立刻把全校时间锚点搬到未来周段。实测后果：`/api/terms/context` 的 `currentWeek` 跳到 1，而今天的日期落在新学期的 `weekOfDate` 范围外 → 课表显示空周、调换课按错误周次校验。这个问题是在验证阶段被真实撞见的（E2E「新建学期」测试跑完后，当前学期变成了测试建的 2027 学期），不是假想场景。
- 考虑过的方案：(A) 保持默认夺权，靠用户记得手动关掉开关；(B) 仅当**系统中还没有任何当前学期**时才默认勾选（首次建学期仍然一步到位）；(C) 后端拒绝在有当前学期时创建 `isCurrent` 学期，强制两步。
- 决策：**选 B**。前端 `hasCurrentTerm = terms.some(t => t.isCurrent)`，`defaultValues.isCurrent = !hasCurrentTerm`，并在字段 hint 写明后果（「勾选后课表周次与调换课立即改按此学期解析，原当前学期会被取消」）。后端语义不变（显式传 `isCurrent:true` 仍然夺权，`setCurrent` 仍然是正规切换入口）。
- 为什么不选其他：A 把「静默改变全局状态」伪装成默认值，属于 footgun——用户点「创建」时的心智是「登记一个学期」，不是「切换全校锚点」；C 过度限制，首次建学期会变成两步，且与「设为当前」按钮的职责重复。B 保留首次建学期的便利，只收窄**已有锚点时**的意外副作用。
- 后果：学期切换变成显式动作（勾开关或点「设为当前」），不再有隐式全局副作用。E2E 新增「已有当前学期时新建不夺权」测试锁定该语义（断言开关默认 `aria-checked=false` + 建完后 `context.term.id` 与 `currentWeek` 均未变）。**该测试经变异验证有牙齿**：把默认值退回 `isCurrent: true` 后测试立即失败。
- 何时重新审视：若引入「校历」概念（多个并行学期/分校区），锚点唯一性假设需要重新设计。
