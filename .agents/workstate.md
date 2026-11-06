# Workstate

> 当前状态快照：只保留仍在生效的焦点、状态、最近完成、下一步与参考。
> 历史记录见 `.agents/worklog/YYYY-MM-DD.md`（按天一篇，同日条目追加到同一文件）。

## 当前焦点

- 无进行中的功能分支；worklog 结构重构与文档归档对齐已合入 `master`（daily 日志、`.agents/workstate.md`、已落地计划移入 `docs/plan/implemented/`）。
- 上一个功能基线：PR #109 S3 传输层验证（fakes3 + AWS SDK 交叉验证）。

## 状态

- CI：`Build and test myz-annotator` 绿（build + 全部 Playwright；S3 测试跑在 fakes3 + `auth: true` 上）。
- 已知未做（均有计划文档记录原因，非阻塞）：
  - E2EE：异地 S3 设备邮箱 **未接 UI**（crypto 与消息已实现并单测；当前同机配对可用）。
  - Inbox：行级滑动手势 / 底部详情抽屉未做（按钮与点按已覆盖同等功能）。
  - EPUB：网页 `.epub` URL、采集浮条内联选色、`ReaderStage` 抽象属可选。
  - Stitch：`ScreenshotMode` / `CollageMode` 组件偏大，待拆分；缓存配额/清理未定。

## 最近完成

- 2026-11-06：S3 传输层验证改用 fakes3（`auth: true`）+ AWS SDK 交叉验证，修掉列表解析、签名路径二次编码、列表分页三个缺陷（PR #109）。
- 2026-11-06：v0.6.7 选区截图卡片化（背景扩张 → 圆角 → 亮度自适应边框）+ 剪贴板复制。
- 2026-10-27：PDF/EPUB 对照翻译并排双栏（PR #105）。

## 下一步

- `docs/plan/host-unification.md` 是唯一未实施的大计划（H0–H7），建议先 H0–H4。
- 其余方向见 `docs/plan/future-plan.md`；已落地计划归档在 `docs/plan/implemented/`。

## 参考

- 计划：`docs/plan/`（`implemented/` = 已落地）、知识：`docs/knowledges/`、评审：`docs/reviews/`
- 日志：`.agents/worklog/YYYY-MM-DD.md`
