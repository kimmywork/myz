# Workstate

> 当前状态快照：只保留仍在生效的焦点、状态、最近完成、下一步与参考。
> 历史记录见 `.agents/worklog/YYYY-MM-DD.md`（按天一篇，同日条目追加到同一文件）。

## 当前焦点

- 0.7 后续「布局统一 + 快照按页面重构」，分支 `feat/unified-workspace`（PR1，未提交）。
- PR1（布局统一）已完成待提交：素材/阅读/划线详情套工作区壳、旧顶栏清零、设置改 modal（rail 底部按钮）、阅读器 `/read` iframe 内嵌、navless 壳。
- PR2（`feat/snapshot-page-model`，未开工）：快照按页面存（去 recordId 绑定）、采集整篇正文、显示折叠「固定显示已标注区域 + 展开前后详情」、命名统一「快照」。

## 状态

- PR1 验证：build / lint 0 错 / 521 单测 / e2e 176 过 1 flaky（pdf-bilingual 可见性，单跑过）/ jscpd 10 / closeout 棘轮 98 无回归。
- 违规基线维持 98（A1 `.btn`、A2 `settings__`、A7 裸色值 5）。

## 最近完成

- 2026-11-23：PR1 布局统一 + 设置 modal + 阅读器内嵌 + 文档对齐（见 `.agents/worklog/2026-11-23.md`）。
- 2026-11-13：I10 逐页视觉收口（Button/Dialog/SettingsGroup 落各面 + 棘轮进 CI）。

## 下一步

- 提交 PR1 并开 PR；之后开 PR2 快照重构（用户拍板：按页面绑定、整篇正文、默认折叠只显示已标注区域）。
- `docs/plan/host-unification.md`（H0–H7）仍是唯一未实施的大计划。

## 参考

- 新决定记录：`docs/research/design-system/design-system.md` §8「2026-11-23 已决定」。
- 快照规格对照：`docs/plan/release-0.7.md` §3.4（用户拍板原案，PR2 将按新拍板修订）。
