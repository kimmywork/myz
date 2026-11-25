# Workstate

> 当前状态快照：只保留仍在生效的焦点、状态、最近完成、下一步与参考。
> 历史记录见 `.agents/worklog/YYYY-MM-DD.md`（按天一篇，同日条目追加到同一文件）。

## 当前焦点

- master `3c48656`：PR #136（设置弹窗 / 工作区壳 / 快照最终形态）与 PR #129（§4.8 焦点落点规范 + 素材页预览收口记录）均已合并。当前无进行中的分支，新需求从 master 起新分支。
- 快照（划线详情）已合并的口径：
  - 采集范围 = **包含这页全部划线的最小连续区域**（首末划线块 + 两侧各 2 个上下文块，`SNAPSHOT_CONTEXT_BLOCKS=2`）；跨段落引用按整根归一化文本定位；**一页只保留最新一份**（保存即替换，`saveSnapshot` 串行化）。
  - 显示 = **块就是块**：提示/揭示是同一个 DOM 节点（揭示=原地去模糊、零位移），行内元素永不切块；「…」撕裂缝三段不重叠（13/14/13px）。
  - 揭示 = **原地 repaint**（`gaps` 非响应式，不重建 `innerHTML`）；只有新出现块播一次淡入。

## 状态

- master `3c48656`；#136（28 个提交压成一条）合并时 CI 门槛全绿（Lint/单测/去重、Build + 全量 e2e）；#129 是纯文档（CI 的 `paths` 不含 docs，无 workflow 运行），`check:design-tokens` 通过。
- 验证基线（2026-11-24）：`npm run build` 0 错、tsc 0 错、lint 0 错（8 条既有警告）、单测 555；`npm run jscpd` / closeout 棘轮 94（原 98）。
- e2e 冷启动预算统一在 `tests/helpers/launch-extension.ts`（钩子 90s），两个 harness 的 `afterAll` 有守卫；`pdf-bilingual` 可见性断言等译完块数稳定。
- 环境备注：SSH 推 GitHub 瞬断，改走 `git -c credential.helper='!gh auth git-credential' push https://…`。
- 注意：`npm run build` 必须在 `myz-annotator/` 下跑（仓库根跑不出类型检查）。

## 最近完成

- 2026-11-25：PR #129 合并——§4.8「聚焦」行写死四层落点 + 「初始焦点永不落提交动作」（对齐已上线的 `Dialog.resolveInitialFocus`）、「关闭优先走标题栏」、§8 第 9 条改为素材页预览「已落地」。
- 2026-11-24：PR #136 合并；CodeRabbit 两轮（10 + 15 条）全部处理（保存串行化、采集跨段落/失败兜底、提示属性归还、批注焦点、专注模式选择、阅读页本地文档入口…）。
- 2026-11-24：PARKING_LOT 批处理 A/C/D/E/H/I/J（e2e 冷启动预算、`stickyLayout` 死参数、收件箱 `SelectionBar`、639.98 断点、`--myz-error-on-dark`、截图前 finish 动画）。
- 2026-11-24：撕裂缝三段不重叠（CI 唯一红灯的根因）；快照折叠「块就是块」重写 + 揭示零抖动。
- 2026-11-24：采集改「划线 span」、一页一版本（Zalando 标题漏采修复）。
- 2026-11-23：工作区统一（#133）与快照按页面（#135）合并。

## 下一步

- 用户在真机复核快照手感/采集范围后给新指示；新工作从 master 起分支，开新 PR。
- 若想恢复「可展开整篇文章」，把 span 换成 whole-root 即可（`truncate.ts` `SNAPSHOT_CONTEXT_BLOCKS` 或 `extractSnapshot` 一行）。
- `PARKING_LOT.md` 剩 3 条：混合标签名排序（`docIndex`）、采集缓存变更广播、缓存区总量上限。
- 远端分支 `fix/settings-modal-scroll` 仍保留；确认不需要回看记录后可删。

## 参考

- 决定记录：`docs/research/design-system/design-system.md` §8.5–8.7（快照口径）、§8.14（详情页交互）、§7 变更记录（2026-11-24 四条）。
- 快照规格：`docs/plan/release-0.7.md` §3.4（已按 2026-11-24 修订）。
- 实现入口：`myz-annotator/src/content/snapshot/`（`extract.ts`/`truncate.ts`/`use-snapshot-capture.ts`）、`src/background/snapshots.ts`、`src/dashboard/pages/highlight-viewer/`（`snapshot-collapse.ts`/`ViewerSnapshotView.tsx`）。
