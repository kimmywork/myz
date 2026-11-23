# Workstate

> 当前状态快照：只保留仍在生效的焦点、状态、最近完成、下一步与参考。
> 历史记录见 `.agents/worklog/YYYY-MM-DD.md`（按天一篇，同日条目追加到同一文件）。

## 当前焦点

- 0.7 后续「布局统一 + 快照按页面重构」。
- PR1（`feat/unified-workspace`，PR #133 已开待合）：素材/阅读/划线详情套工作区壳、旧顶栏清零、设置改 modal（rail 底部按钮）、阅读器 `/read` iframe 内嵌、navless 壳。
- PR2（`feat/snapshot-page-model`，叠在 PR1 上，代码完成待 e2e）：快照按页面绑定（去 recordId）、采集整篇正文、显示折叠「固定显示已标注区域 + 展开前后详情」、无限滚动页改邻域窗、命名「快照」。

## 状态

- PR1 验证全绿：build / lint 0 错 / 521 单测 / e2e 177 过 / jscpd 10 / closeout 棘轮 98 无回归。
- PR2：build / lint 0 错 / 530 单测（含新 collapse 测试）全过；全量 e2e 跑动中。
- 违规基线维持 98（A1 `.btn`、A2 `settings__`、A7 裸色值 5）。

## 最近完成

- 2026-11-23：PR2 快照按页面重构（见 `.agents/worklog/2026-11-23.md`）。
- 2026-11-23：PR1 布局统一 + 设置 modal + 阅读器内嵌 + 文档对齐。

## 下一步

- PR2 e2e 绿后提交并开 PR（base = `feat/unified-workspace`，PR1 合并后自动改基线）。
- 快照截断 N 的记录命中变体探针（§6-2）仍是待办；`docs/plan/host-unification.md`（H0–H7）未动。

## 参考

- 新决定记录：`docs/research/design-system/design-system.md` §8「2026-11-23 已决定」（1–4 布局/设置/阅读器，5–8 快照）。
- 快照原始规格 + 修订条：`docs/plan/release-0.7.md` §3.4。
