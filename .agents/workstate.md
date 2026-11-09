# Workstate

> 当前状态快照：只保留仍在生效的焦点、状态、最近完成、下一步与参考。
> 历史记录见 `.agents/worklog/YYYY-MM-DD.md`（按天一篇，同日条目追加到同一文件）。

## 当前焦点

- 工程质量基线修复已落地：测试/CI 门禁、README 对齐、重复代码与长函数清理（详见 `.agents/worklog/2026-11-09.md`）。
- 上一个功能基线：PR #109 S3 传输层验证（fakes3 + AWS SDK 交叉验证）。

## 状态

- CI：`Build and test myz-annotator` + 新增 `quality` job（版本一致性、Vitest、ESLint、jscpd、设计令牌）均绿；完整 Playwright 125 passed / 3 skipped。
- 代码质量：annotator ESLint 0 warning；jscpd 10 处克隆 / 约 0.2% 重复行；`npm run test:dev` 恢复绿色。
- 已知未做（均有计划文档记录原因，非阻塞）：
  - E2EE：异地 S3 设备邮箱 **未接 UI**（crypto 与消息已实现并单测；当前同机配对可用）。
  - Inbox：行级滑动手势 / 底部详情抽屉未做（按钮与点按已覆盖同等功能）。
  - EPUB：网页 `.epub` URL、采集浮条内联选色、`ReaderStage` 抽象属可选。
  - Stitch：`ScreenshotMode` / `CollageMode` 组件偏大，待拆分；缓存配额/清理未定。
  - 日志：`@myz/shared/logger` 已落地，background/capture/ask-ai/popup/highlights 已迁移，其余 console 调用可渐进替换。

## 最近完成

- 2026-11-09：P0/P1 工程质量修复（CI 质量门禁、版本校验、README、重复代码 27→10、长函数 warning 42→0、共享 logger）。
- 2026-11-06：S3 传输层验证改用 fakes3（`auth: true`）+ AWS SDK 交叉验证，修掉列表解析、签名路径二次编码、列表分页三个缺陷（PR #109）。
- 2026-11-06：v0.6.7 选区截图卡片化（背景扩张 → 圆角 → 亮度自适应边框）+ 剪贴板复制。

## 下一步

- `docs/plan/host-unification.md` 是唯一未实施的大计划（H0–H7），建议先 H0–H4。
- 产品缺口优先级：截图入库成 `MyZRecord`、E2EE 设备邮箱 UI、检索/标签治理。
- 其余方向见 `docs/plan/future-plan.md`；已落地计划归档在 `docs/plan/implemented/`。

## 参考

- 计划：`docs/plan/`（`implemented/` = 已落地）、知识：`docs/knowledges/`、评审：`docs/reviews/`
- 日志：`.agents/worklog/YYYY-MM-DD.md`
