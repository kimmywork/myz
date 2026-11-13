# Workstate

> 当前状态快照：只保留仍在生效的焦点、状态、最近完成、下一步与参考。
> 历史记录见 `.agents/worklog/YYYY-MM-DD.md`（按天一篇，同日条目追加到同一文件）。

## 当前焦点

- 0.7 迭代，当前增量 I10「逐页视觉收口」：把 `Button` / `Dialog` / `SettingsGroup` 三个共享件落到各面，并逐面做「改前/改后截图 + 差异量化」。
- 已完成的面：设置、素材、阅读、查看器。popup 与内容层经检查无需改代码（popup 无违规且截图不变；内容层保持手写样式，取值同源，三处裸色值有注释理由）。
- A 类检查已挂进 CI，形式是棘轮：`npm run check:closeout:ratchet`，基线在 `scripts/design-system/closeout-baseline.json`（只降不升，上调需单独提交并写理由）。

## 状态

- 违规基线：146 → 98（A1 `.btn` 53、A2 `settings__` 40、A7 裸色值 5、A3/A5 0）。
- 分支 `feat/0.7-i10-visual-closeout`，PR 待开。
- 截图：48 张（6 个面 × 深浅 × 4 档断点），基线由 master 构建重拍；能逐字节相同的就逐字节相同，不能的量化差异并定位区域。

## 最近完成

- 2026-11-13：I10 收口 —— 阅读面 flush 行、查看器按钮、`Dialog` 初焦点按四级落点解析、A 类检查挂 CI 棘轮。
- 2026-11-12：I10 基础件 —— `Button`、`Dialog`（复用共享焦点陷阱）、`SettingsGroup`；素材页与设置面试点。
- 2026-11-09：P0/P1 工程质量修复（CI 质量门禁、版本校验、README、重复代码 27 → 10、长函数 warning 42 → 0、共享 logger）。

## 下一步

- I10 合入后：I11 工程收口；`docs/plan/host-unification.md`（H0–H7）仍是唯一未实施的大计划。
