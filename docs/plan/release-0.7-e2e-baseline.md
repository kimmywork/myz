# 0.7 e2e 基线（I11）

> 状态：**执行记录**（2026-11-13）。用途：把「测试是稳定的」从一句话变成可点开的证据。
> 门禁与命令见 `docs/plan/release-0.7-increments.md` 的 I11 一节。

## 为什么要有这份东西

0.7 期间至少两次在 PR 里写过「这条挂了，单跑能过，是时序抖动，与本次改动无关」。这句话在当时**没有证据**——它既可能是真的环境抖动，也可能是刚被引入的竞态。I11 的验收就是去验证它：**关掉重试，连跑 10 次**。

重试会掩盖问题：CI 默认 `retries: 2`，一条 30% 概率挂的用例在三次里必过的概率是 97%，看上去永远绿。

## 方法

- 触发方式：`gh workflow run extension-ci.yml --ref <branch>`，job `e2e-no-retries` 是 **10 个并行 job 的矩阵**，每个 job `--retries=0`。
- 每个 job 是一次独立的 runner、独立构建、独立浏览器，环境与普通 PR 相同。
- 运行号是 job 的 URL，**任何人都能点开复核**，不是本地日志。
- 本地连续跑只用于排查（「是本机还是产品」），不作为交付证据。

## 一个必须先说的坑

第一次跑完才发现：`inbox.spec.ts` 里有一行 `test.describe.configure({ retries: 1 })`。
它**覆盖了命令行上的 `--retries=0`**，所以那一轮里 inbox 的用例实际上还是带重试的（日志里 `1 flaky` 就是它），而其它文件确实是 0 重试。

这就是「配了门禁」和「门禁真的生效」的差别：命令行看着是对的，日志里却有 `retry #1`。现在那行已删掉，并且在 10 轮的日志里用 `grep "retry #"` 应当为 0 来自检。

## 结果

### 第 1 轮（10 个 job）

| # | 结果 | job |
|---|---|---|
| 1 | ✅ | https://github.com/kimmywork/myz/actions/runs/43448674382/job/131964767955 |
| 2 | ✅ | https://github.com/kimmywork/myz/actions/runs/43448674382/job/131964768020 |
| 3 | ✅ | https://github.com/kimmywork/myz/actions/runs/43448674382/job/131964767772 |
| 4 | ✅ | https://github.com/kimmywork/myz/actions/runs/43448674382/job/131964767389 |
| 5 | ✅ | https://github.com/kimmywork/myz/actions/runs/43448674382/job/131964767814 |
| 6 | ❌ | https://github.com/kimmywork/myz/actions/runs/43448674382/job/131964767970 |
| 7 | ✅ | https://github.com/kimmywork/myz/actions/runs/43448674382/job/131964767951 |
| 8 | ✅ | https://github.com/kimmywork/myz/actions/runs/43448674382/job/131964768267 |
| 9 | ✅ | https://github.com/kimmywork/myz/actions/runs/43448674382/job/131964768302 |
| 10 | ✅ | https://github.com/kimmywork/myz/actions/runs/43448674382/job/131964767643 |

**9/10。** 失败的是 `viewer-delete.spec.ts` 的第一条：

- 现象：`page.waitForSelector` 等「删除」按钮，8s 超时。
- 关键旁证：**同一个文件里后两条在 0.5s 和 6.6s 内通过**——说明扩展已经热了，是这一条替整个文件付了冷启动成本。
- 判定：冷启动延迟，不是渲染逻辑坏了。修法不是把功能等待调长，而是**把两段等待分开**：先等应用外壳（20s，覆盖冷启动），再等动作按钮（仍然 8s）。如果哪天「外壳起来了但按钮不出来」，测试照样红。

### 第 2 轮（修复 viewer 冷启动后）

- 运行：https://github.com/kimmywork/myz/actions/runs/43453567322
- **9/10**。失败的是 `e2e without retries (10/10)`（job 131981766905）。

挂着两条，性质不同：

| 用例 | 现象 | 判定与处置 |
|---|---|---|
| `snapshot-view.spec.ts` 第一条 | `waitForSelector` 10s 超时 | 和上轮同一类：直接 `goto` 之后马上等功能元素，没有先等应用外壳。已改为走 `harness.navigate()`（外壳 20s 预算，功能等待仍是 10s） |
| `inbox_multi_select_drag_tags_all_selected` | 2.5s 失败，**retry #1 后通过**（日志里 `1 flaky`） | 本轮才暴露：该文件自带 `retries: 1`。删掉后单跑三次全过，说明原来那条是 `dragTo` 之后立刻读记录、和后台消息往返赛跑。改成轮询标签，断言不变、竞态消失 |

### 第 3 轮（修复后重跑）

- 运行：https://github.com/kimmywork/myz/actions/runs/43458774155
- **10/10 全绿**，每轮 **177 passed / 3 skipped / 0 failed**（约 3.8 分钟），日志里 `retry #` 出现 **0** 次。

| # | job |
|---|---|
| 1 | https://github.com/kimmywork/myz/actions/runs/43458774155/job/131999828799 |
| 2 | https://github.com/kimmywork/myz/actions/runs/43458774155/job/131999828602 |
| 3 | https://github.com/kimmywork/myz/actions/runs/43458774155/job/131999828928 |
| 4 | https://github.com/kimmywork/myz/actions/runs/43458774155/job/131999828780 |
| 5 | https://github.com/kimmywork/myz/actions/runs/43458774155/job/131999828675 |
| 6 | https://github.com/kimmywork/myz/actions/runs/43458774155/job/131999829090 |
| 7 | https://github.com/kimmywork/myz/actions/runs/43458774155/job/131999830123 |
| 8 | https://github.com/kimmywork/myz/actions/runs/43458774155/job/131999828791 |
| 9 | https://github.com/kimmywork/myz/actions/runs/43458774155/job/131999828873 |
| 10 | https://github.com/kimmywork/myz/actions/runs/43458774155/job/131999828919 |

**结论**：三轮 30 次运行共 3 次失败，全部落在**首次导航的冷启动**和**拖拽后立刻读记录**这两类上，没有一条是产品逻辑错误；两处都已按根因修掉（不是调大超时掩盖），第三轮 10/10。
换句话说：0.7 里那句「单跑能过、是时序抖动」**大体成立，但不是「无关」**——它是两个可以修掉的测试缺陷，修完就不抖了。

## 关键路径覆盖

六条关键路径与守护它们的用例（都在 `myz-annotator/tests/` 下，`npm run test:playwright` 会跑）：

| 关键路径 | 用例 |
|---|---|
| 采集（选区截图 / 页面图片 / 视频帧） | `extension/screenshot.spec.ts`、`extension/assets-page.spec.ts`、`extension/stitch.spec.ts` |
| 高亮（划线、样式、持久化、重叠、重建） | `extension/highlight-apply-and-persistence.spec.ts`、`highlight-overlap.spec.ts`、`highlight-rebuild.spec.ts`、`highlight-toolbar.spec.ts` |
| 删除与撤销 | `extension/delete-unification.spec.ts`、`viewer-delete.spec.ts`、`reader-delete-refresh.spec.ts`、`inspector-delete.spec.ts`、`themed-confirm.spec.ts` |
| 批量（选择、批量删、批量打标签、批量存记录） | `extension/bulk-selection.spec.ts`、`dashboard-bulk-readers.spec.ts`、`assets-page.spec.ts` |
| 快照回看（版本分组、配额、未定位快照） | `extension/snapshot-view.spec.ts`、`snapshot-quota.spec.ts` |
| 导入导出 | `extension/dashboard.spec.ts`（导出 Markdown、按文件导入）、`extension/dashboard.spec.ts` 的 settings 上传流 |
| PDF / EPUB 重开还原 | `pdf/pdf-reader.spec.ts`、`extension/epub-reader.spec.ts`、`extension/reader-list.spec.ts` |

## 发布门禁与它们的失败演示

| 门禁 | 命令 | 演示（故意弄坏，确认它红） |
|---|---|---|
| dist 体积 ≤ 45 MiB | `npm run check:dist-size` | 用 `--limit-mib 40` 跑：`✗ dist is 40.80 MiB, over the 40 MiB limit` |
| 裸色值（A7，UI 目录） | `npm run check:closeout` | 在 `dashboard/` 加一处 `style={{ color: "#ff00aa" }}`：A7 5 → 6 并指出行号，删掉后回到 5 |
| 违规数棘轮 | `npm run check:closeout:ratchet` | 把基线调高一位即失败；对「自己的基线」要求精确相等 |

dist 现在 **40.80 MiB / 1379 个文件**（`du` 显示 44M 是磁盘块占用，不是字节数）。

## 本轮不做、已登记给 0.8

| 项 | 现状 | 归属 |
|---|---|---|
| `settings__*` 过渡类 | 40 处（设置页导入区 + `styles.css` 里的规则） | 0.8，随导入区重做一起清 |
| A7 裸色值 | 5 处，全部在 `epub/render.ts` 的排版色值 | 0.8，需要先定「EPUB 排版色」是否走 token |
| 内容层组件化 | 只核了取值同源，仍是手写样式 | 0.8 |

这些数字留在计数里是**有意的**：棘轮会把它们锁住，只降不升；不清零不假装清零。
