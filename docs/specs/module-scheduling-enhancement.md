# Spec — 排课增强（学期 / 课表三维度 / 调换课 / 自动派课）

## 要构建什么

- 目标：在「循环排课 + 冲突检测」的基座上，补齐Guga 课务式的完整课务能力——学期时间锚点、三维度课表、单次课调换、批量自动派课。

## 行为

### 1. 学期（term）
- 学期 = `startDate`(规整为周一) + `totalWeeks` + `isCurrent`；全表至多一条当前学期。
- 提供日期↔教学周双向纯函数（`shared/domain.ts`）：`weekOfDate` / `weekdayOfDate` / `dateOfWeekday` / `weekStartDate` / `startOfWeekMonday`。
- `/api/terms/context` 返回当前学期 + 今天的教学周/星期；课表页据此定位周次（不再硬编码）。

### 2. 课表三维度
- `weekTimetable({week, teacherId, classId})` 按维度过滤循环排课。
- 前端 `/timetable` 用 `Tabs` 切换 全校/教师/班级，选中实体后过滤；复用 `TimetableGrid`（节次×星期网格，课程色卡片）。

### 3. 调换课（例外层）
- `schedule_exceptions` 表：(scheduleId, originalDate, action) 唯一，action ∈ cancelled/moved/substituted。
- `resolveDay(date, scope)` 解析单日实际课次：循环排课命中该天 − 移出/取消 + 调入（代课覆盖教师），每条带 `LessonStatus`。
- 操作：`cancel`(停课,幂等) / `substitute`(代课,换教师) / `swap`(对调=两条互指对方日期的 moved，交换节次、各留教室) / `clearOccurrence`(恢复)。
- swap 校验两个 occurrence 真实存在（weekday 匹配 + 在教学周内），拒绝空调/越界/自身对调。

### 4. 自动派课（贪心+回溯）
- `POST /api/schedules/auto`：为选定班级批量生成排课，满足每班「每周 lessonsPerWeek 次、每次 periodsPerLesson 连堂」。
- 算法：任务展开 → 候选时段枚举（period-major 排序使同班分散到不同天）→ 回溯搜索（内存虚拟占位参与三维冲突检测）→ all-or-nothing 落库。
- 约束：教室∪教师∪同班 × 节次区间 × 教学周段 相交即冲突；尊重既有排课作为固定障碍。

## 输入 / 输出

- 输入：日期/教学周（课表）、例外操作载荷（调换课）、`AutoScheduleRequest`（classIds/lessonsPerWeek/periodsPerLesson/weekdays/rooms/周段）。
- 输出：`ScheduleDto[]`（课表）、`ResolvedLesson[]`（单日课表，带 status）、`AutoScheduleResult`（placed/failed/backtracks/message）。

## 约束

- 学期 startDate 必为周一（`startOfWeekMonday` 规整），否则日期↔周往返错位。
- 调换课只写例外，不改循环排课本体；学期内其余周次不受影响。
- 自动派课 all-or-nothing：排不全则一节不落库；回溯超上限（默认 20000）提前终止。
- 单日课表必须经 `resolveDay` 解析，不能直接读 schedules 表。

## 边界条件

- 无当前学期：课表回退第 1 周 + UI 琥珀提示；调换课仍可解析（只校验 weekday）。
- 日期不在教学周范围：`weekOfDate` 返回 null，该日无循环课。
- 对调不存在的 occurrence（该排课当天无课 / 日期越界）→ 拒绝并给可读原因。
- 同日对调：两节交换节次，各留教室，不产生重复正常课。
- 自动派课约束过紧（教师/教室/时段不足）→ 全部 failed + 放宽建议文案。

## 验收标准

- [x] 日期↔教学周往返一致（17 项单测，含 startOfWeekMonday 规整）。
- [x] 课表三维度切换（E2E：三个 tab 可见可切、选中实体后出现对应选择器）。
- [x] 教师/班级维度**真过滤**而非只渲染网格（E2E 用 API 当地面真相交叉断言：UI 节数 == 该维度 API 节数 < 全校节数，且每张课卡教师名 == 所选教师）。
- [x] 调换课 resolveDay：正常/停课/代课/跨日对调/同日对调/校验/恢复（9 项单测）；另经 API 实测对调三态（不存在 occurrence / 自身对调 / 学期外日期均被拒）、代课不波及其他周次。
- [x] 自动派课：可行零冲突、同班分散不同天、共享教师回溯、尊重既有障碍、不可行 all-or-nothing、教室池（6 项单测）；另经 API 实测派课后全校 13 节零三维冲突、不可行时 placed=0/failed=3 且落库数不变。
- [x] 三新功能 E2E 全绿（课表切换/教师课表/维度过滤/学期管理/新建学期不夺权/调换课停复课/自动派课运行）。
- [x] 自动派课契约前后端同源（`shared/domain.ts` 单一源，无副本；见 ADR-013）。
- [x] 新建学期不静默劫持当前学期锚点（`hasCurrentTerm` 时开关默认关；见 ADR-014）。
- [x] 上述两条新 E2E 均经**变异验证**确认有牙齿（退回修复后测试立即失败）。

## 完成定义

- 四者（学期/三维度课表/调换课/自动派课）前后端贯通，单测锁算法语义、E2E 锁 UI 流程；全库 32 单测 + 24 E2E 通过，双方言 parity 校验通过（13 业务表）。
