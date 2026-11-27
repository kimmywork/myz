# Workstate

> 当前状态快照：只保留仍在生效的焦点、状态、最近完成、下一步与参考。
> 历史记录见 `.agents/worklog/YYYY-MM-DD.md`（按天一篇，同日条目追加到同一文件）。

## 当前焦点

- master 工作区（未建分支/PR）：2026-11-27 完成 8 项收尾脏活，改动仍在工作区未提交。
- 文库改为**列表唯一视图**（卡片/切换/`dashboardView` 全删）；Inbox 详情改为半屏快照视图；快照定位用 `anchorText`（块/行内标签区别剥离）+ Markdown 兜底，已修 `<li>` 采集；首尾无划线内容默认全隐藏但保留可展开的「…」缝。

## 状态

- master `816282e` 起改；`vue-tsc -b` 0 错，lint 0 错（9 既有警告），单测 563 全绿，`npm run build` 成功。
- e2e `184 passed / 2 skipped`，唯一失败是 `stitch.spec.ts` 远程视频 afterAll 超时（与本轮无关，单跑被跳过）。
- `npm run jscpd` 9 clones / 0.16%；`check:closeout:ratchet` 无回归（94）。

## 最近完成

- 2026-11-27：撤销 toast 按钮样式；文件选择器 AbortError 静默；文库按 inbox 状态过滤（UI 层，不删记录）；`StatusPill` nowrap；Inbox 半屏快照详情；移除卡片视图；本地文件授权失效拦截 + PDF/EPUB 显示作品名；快照锚定纯文本化。
- 2026-11-25：PR #129 合并；2026-11-24：PR #136 合并（详见当天 worklog）。

## 下一步

- 用户复核 8 项效果；如需提交，从 master 起分支并显式列文件提交（当前直接改在 master 工作区）。
- `PARKING_LOT.md` 剩 3 条：混合标签名排序、采集缓存变更广播、缓存区总量上限。

## 参考

- 快照口径：`docs/research/design-system/design-system.md` §8.5–8.7、§8.14；`docs/plan/release-0.7.md` §3.4。
- 实现入口：`src/dashboard/pages/inbox/InboxDetailPanel.tsx`、`src/dashboard/pages/highlight-viewer/ViewerSnapshotView.tsx`、`packages/shared/src/recordDisplay.ts`（`recordAnchorText`）、`packages/dashboard-ui/src/workspace/WorkspaceShell.tsx`（`panelWide`）。
