# Workstate

> 当前状态快照：只保留仍在生效的焦点、状态、最近完成、下一步与参考。
> 历史记录见 `.agents/worklog/YYYY-MM-DD.md`（按天一篇，同日条目追加到同一文件）。

## 当前焦点

- **持续工作分支 `fix/settings-modal-scroll`（PR #136，open、未合并）**：设置弹窗定高 + 左右独立滚动已入；之后所有快照交互/采集的新需求都在此 PR 追加，不再开新 PR。合并等用户发话。
- 快照（划线详情）已定稿的口径：
  - 采集范围 = **包含这页全部划线的最小连续区域**（首末划线块 + 两侧各 2 个上下文块，`SNAPSHOT_CONTEXT_BLOCKS=2`）；**一页只保留最新一份**（保存即替换）。
  - 显示 = **块就是块**：提示/揭示是同一个 DOM 节点（揭示=原地去模糊、零位移），行内元素永不切块；非划线内容折叠在「…」裂缝后（外侧划线为视觉锚，A/G 不在视口退化为点击元素）。
  - 揭示 = **原地 repaint**（`gaps` 非响应式，不重建 `innerHTML`）；只有新出现块播一次淡入。

## 状态

- PR #133（布局统一）、PR #135（快照按页面）已合并进 master；PR #136 持续追加。
- 验证基线（2026-11-24）：`npm run build` 0 错、tsc 0 错、lint 0 错（8 条既有警告）、单测 545 过；`npm run jscpd` / 棘轮 98 无回归。
- e2e flake 的根因已定位并修掉：33 个 spec 的 `beforeAll` 冷启动共享默认 30s 钩子超时 → `launch-extension.ts` 统一抬到 90s；`pdf-bilingual` 可见性断言改为等译完块数稳定。
- 环境备注：SSH 推 GitHub 瞬断，改走 `git -c credential.helper='!gh auth git-credential' push https://…`。
- 注意：`npm run build` 必须在 `myz-annotator/` 下跑（仓库根跑不出类型检查）。

## 最近完成

- 2026-11-24：PARKING_LOT 批处理 A/C/D/E/H/I/J（e2e 冷启动预算、`stickyLayout` 死参数、收件箱 `SelectionBar`、639.98 断点、`--myz-error-on-dark`、截图前 finish 动画）。
- 2026-11-24：快照折叠「块就是块」重写 + 揭示零抖动（原地 repaint）+ 全块提示/视觉锚定稿。
- 2026-11-24：采集改「划线 span」、一页一版本；`page-eligibility`/run 截断/site 表删除；Zalando 标题漏采修复（真实页面验证通过）。
- 2026-11-23：快照按页面绑定 + 渐隐显示 + 记录定位修复（PR #135）。

## 下一步

- 等 CI（PR #136 最新提交起）绿；用户在真机复核快照手感/采集范围后按指示收尾。
- 若用户想恢复「可展开整篇文章」，把 span 换成 whole-root 即可（`truncate.ts` `SNAPSHOT_CONTEXT_BLOCKS` 或 `extractSnapshot` 一行）。
- `PARKING_LOT.md` 剩 3 条：混合标签名排序（`docIndex`）、采集缓存变更广播、缓存区总量上限。

## 参考

- 决定记录：`docs/research/design-system/design-system.md` §8.5–8.7（快照口径）、§8.14（详情页交互）、§7 变更记录（2026-11-24 三条）。
- 快照规格：`docs/plan/release-0.7.md` §3.4（已按 2026-11-24 修订）。
- 实现入口：`myz-annotator/src/content/snapshot/`（`extract.ts`/`truncate.ts`/`use-snapshot-capture.ts`）、`src/background/snapshots.ts`、`src/dashboard/pages/highlight-viewer/`（`snapshot-collapse.ts`/`ViewerSnapshotView.tsx`）。
