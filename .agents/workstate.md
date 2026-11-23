# Workstate

> 当前状态快照：只保留仍在生效的焦点、状态、最近完成、下一步与参考。
> 历史记录见 `.agents/worklog/YYYY-MM-DD.md`（按天一篇，同日条目追加到同一文件）。

## 当前焦点

- 0.7 后续「布局统一 + 快照按页面重构」。
- PR1（PR #133）**已合并**（squash，含 3 条 review 修复：settings 深链尾斜杠、陈旧 export、阅读器 kind 按 pathname 判定；ARIA tabs 建议以理由回复不采用）。
- PR2（`feat/snapshot-page-model`，PR #135）：快照按页面绑定（去 recordId）、采集整篇正文、**渐隐模糊显示**（只显示高亮部分、其余就地模糊点击展开，正文用 `.read-body`/`.prose` markdown 样式）、record 定位修复（判定与落标共用全文归一化索引）、无限滚动页改邻域窗、命名「快照」。
- **持续工作分支 `fix/settings-modal-scroll`（PR #136）**：设置弹窗定高 + 左右独立滚动已入；后续新需求（排序规则、详情页快照-only、快照样式/批注、PDF/EPUB 不进详情）都在此 PR 追加，不再开新 PR。

## 状态

- PR #133 合入 master；PR #135 修完 CodeRabbit 6 条后合并；PR #136 持续追加、暂不合并。
- 验证基线：build / lint 0 错 / 538+ 单测 / e2e 178 过 / jscpd 10 / 棘轮 98 无回归。
- 违规基线维持 98（A1 `.btn`、A2 `settings__`、A7 裸色值 5）。
- 环境备注：SSH 推 GitHub 瞬断，改走 `git -c credential.helper='!gh auth git-credential' push https://…` 成功；SSH 恢复后可照常。

## 最近完成

- 2026-11-23：PR2 快照按页面重构（见 `.agents/worklog/2026-11-23.md`）。
- 2026-11-23：PR1 布局统一 + 设置 modal + 阅读器内嵌 + 文档对齐。

## 下一步

- PR2 e2e 绿后提交并开 PR（base = `feat/unified-workspace`，PR1 合并后自动改基线）。
- 快照截断 N 的记录命中变体探针（§6-2）仍是待办；`docs/plan/host-unification.md`（H0–H7）未动。

## 参考

- 新决定记录：`docs/research/design-system/design-system.md` §8「2026-11-23 已决定」（1–4 布局/设置/阅读器，5–8 快照）。
- 快照原始规格 + 修订条：`docs/plan/release-0.7.md` §3.4。
