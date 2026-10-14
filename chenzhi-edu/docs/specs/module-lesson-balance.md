# Spec — 课时余额生命周期（lesson balance）

## 要构建什么

- 目标：以学员的 `balanceLessons`（剩余课时）为核心，串联「订单充值 → 考勤消课 → 退款回滚」，保证余额始终等于真实可用课时，且全程可追溯、不出现负数。

## 行为

余额是跨 order / attendance 两模块的共享状态，全部经 repo 层的**原子 SQL 表达式**维护：

1. **充值（订单）**：创建 `status=paid` 的订单 → `balance += lessonsPurchased`。订单状态流转到 paid（原非 paid）→ 同样充值。
2. **消课（考勤）**：点名时，状态 ∈ {present, late, makeup}（`LESSON_CONSUMING`）→ 按 `consumedLessons`（默认 1）扣减：`balance = MAX(0, balance - consume)`。leave/absent 不扣。
3. **改判回滚**：同一(排课,学员,日期)已存在考勤记录时，按 `新消耗 - 旧消耗` 的差额调整（如 absent→present 补扣、present→absent 退回）。
4. **撤销回滚**：删除一条 consuming 考勤 → `balance += consumedLessons`（退还已扣课时）。
5. **退款/取消（订单）**：paid → refunded/cancelled → `balance = MAX(0, balance - lessonsPurchased)`（扣回充值）。

## 输入 / 输出

- 输入：订单创建/状态流转、考勤 markBatch/remove、手动余额调整（`POST /api/students/:id/balance {delta}`）。
- 输出：更新后的 `balanceLessons`（整数，≥0）；低余额（≤3）进入预警列表。

## 约束

- **永不为负**：所有扣减用 `MAX(0, balance - x)`（sqlite `MAX` / pg `GREATEST` 由 drizzle `sql` 模板按方言渲染——当前统一用 `MAX`，sqlite 原生支持，pg 侧需注意，见边界）。
- **幂等**：考勤按 (scheduleId, studentId, lessonDate) 唯一约束，重复点名是 upsert + 差额调整，不会重复扣课。
- **原子性**：扣减/充值是单条 `UPDATE ... SET balance = MAX(0, balance ± x)`，不读后写，避免并发丢失更新。

## 边界条件

- 余额不足时消课：仍扣到 0（不阻断点名），由低余额预警提示续费，而非拒绝上课。
- 退款时课时已消耗：`MAX(0, ...)` 兜底，余额不会变负（已消课时不追回）。
- 手动调整 delta 可为负（如纠错扣减），同样 floor 0。
- 订单 pending→cancelled（从未 paid）：不触发任何余额变动。

## 验收标准

- [x] 订单 paid → 余额 += lessons（E2E `订单充值` 断言 0→15）。
- [x] 退款 → 余额扣回（E2E 断言 15→0）。
- [x] 考勤 present → 余额 -1（smoke 测试 39→38）。
- [x] 重复点名同状态 → 差额 0，不重复扣（smoke `action:updated` 余额不变）。
- [x] 余额 floor 0，不为负（smoke `balance after -10 (floor 0): 0`）。

## 完成定义

- 充值/消课/回滚/退款四条路径均有测试覆盖，余额恒 ≥0 且与订单/考勤记录自洽。
- floor 表达式经 `Repository.floorAt(col, delta)` 统一收口，**按方言渲染**（sqlite `MAX(0, …)` / pg `GREATEST(0, …)`），双方言均正确。
