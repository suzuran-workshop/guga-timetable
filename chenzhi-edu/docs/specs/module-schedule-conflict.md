# Spec — 排课冲突检测（schedule conflict）

## 要构建什么

- 目标：在创建/更新排课时，自动检测同一「教室」或「教师」在重叠时段是否已有课，冲突则拒绝并返回可读原因，避免线下撞车。

## 行为

- 冲突判定为**三维相交**，三者同时成立才算冲突：
  1. **同一天**：`weekday` 相等；
  2. **节次区间相交**：闭区间 `[startPeriod, endPeriod]` 与已有排课相交（`aStart ≤ bEnd && bStart ≤ aEnd`）；
  3. **教学周段相交**：`[weekStart, weekEnd]` 与已有排课相交（同上闭区间判定）。
- 在三维相交的前提下，命中以下任一即冲突：
  - **教室冲突**：新排课 room 与已有排课 room 非空且相等 → `教室「X」在<班级>已被占用`；
  - **教师冲突**：新排课所属班级教师 与 已有排课所属班级教师 非空且相同 → `教师「Y」在<班级>已有排课`。
- 更新（PATCH）时排除自身 id，避免与自己冲突。
- 教室优先级高于教师：同一对排课若既同教室又同教师，报教室冲突。

## 输入 / 输出

- 输入：`ScheduleInput`（classId, weekday, startPeriod, endPeriod, weekStart, weekEnd, room）+ 解析出的班级 teacherId；更新时附 excludeId。
- 输出：`{ ok: true, schedule }` 或 `{ ok: false, conflicts: string[] }`。HTTP 层：成功 201，冲突 **409** + `{error:'schedule_conflict', conflicts}`。

## 约束

- 教师维度需经 `schedules → classes → teachers` 关联取得（排课表本身不存 teacherId）。
- 节次上限 14、weekday 1~7（zod `scheduleSchema` 约束）。
- 检测在 repo 层 `detectConflict` 内完成，读同 weekday 全量排课后在内存判定（数据量小，单机形态足够）。

## 边界条件

- room 为空/teacher 为空：对应维度**不**判冲突（未定教室/无教师的排课不占用资源）。
- 周段不交（如 1~8 周 vs 9~16 周）：即使同教室同节次也**不**冲突（分阶段使用）。
- 节次相邻不重叠（1~2 vs 3~4）：不冲突。
- 单节 vs 多节部分重叠（1~2 vs 2~3，共享第 2 节）：冲突。

## 验收标准

- [x] 同教室重叠时段 → 409 教室冲突（E2E `排课冲突检测`）。
- [x] 同教师重叠时段 → 409 教师冲突（smoke 测试覆盖）。
- [x] 周段不交 / 节次不交 → 允许创建（smoke 测试 `schedule no conflict`）。
- [x] 更新时不与自身冲突。

## 完成定义

- 冲突判定纯函数化、可单测；HTTP 层稳定返回 409 + conflicts；E2E 与 repo smoke 测试均通过。
