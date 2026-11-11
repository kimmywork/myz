# 0.7 增量拆分（0.7.0）

> 状态：**执行计划**（2026-11-10）。对应范围：`docs/plan/release-0.7.md`。
> 前置：范围文档由 PR #114 引入，本文件依赖它——合并顺序上 #114 先合。
> 工作流：**只有一条主干 `master`**，不用长期 release 分支。一个增量 = 一个分支 + 一个 PR，直接进 `master`，合完删分支。
> 用途：把 0.7 切成能逐个合入、逐个验收的 PR。每个增量一个 PR，合入后 `master` 必须仍然是绿的。

---

## 0. 通用规则

1. **一个增量 = 一个分支 + 一个 PR**，目标分支 `master`。分支名 `feat/0.7-iN-<slug>`，合并后立即删除。
2. 开工：`git fetch origin && git switch -c feat/0.7-iN-<slug> origin/master`。
3. 合入前必绿：`myz-annotator` 下 `npm run lint`、`npm run build`、`npm run test:dev`；涉及 UI 或行为的再加 `npm run test:e2e`；根目录 `npm run jscpd:check`（新代码不制造重复）。设计与 token 相关的加 `npm run check:design-tokens`。合入后 `master` 的 CI 不能变红。
4. **不搭顺风车**：增量之外的顺手重构、命名统一、依赖升级，一律不开。发现了记进仓库根的 `PARKING_LOT.md`（I1 建），不塞进当前 PR。
5. 每个 PR 描述固定四段：本增量做了什么 / 不做什么 / 怎么验 / 合入后用户能看到什么。
6. 每个增量都要能**单独回滚**：不留下「删了旧代码但新代码靠后一个增量」的中间态。
7. **验收命令不能自指**：命令里如果带着被检字符串，必须排除承载它的文档（如 `-g '!release-0.7-increments.md'`），或缩小搜索范围（只搜代码、`README*` 等，不搜写下这条命令的规格文档）；否则永远返回不了 0（I1 踩过）。改判定的措辞没用——命中来自文档本身。

---

## 1. 增量序列

| # | 增量 | 依赖 | 规模 | 合入后用户能看到什么 |
|---|---|---|---|---|
| I1 | 文档债清理 | — | 0.5 天 | 无（仓库整洁） |
| I2 | 工作区骨架：壳 + 图标栏 + 可拖导航 | I1 | 2–3 天 | 左侧图标栏 + 可拖窄导航 |
| I3 | 列表行与密度（Inbox + 文库） | I2 | 2–3 天 | 一屏条目翻倍，不再每行一张卡片 |
| I4 | 删除统一（撤销 / 确认两条轴） | I3 | 2–3 天 | 删除不再弹系统灰框，可撤销 |
| I5 | 批量（文库）+ 阅读页删除动作 | I4 | 2–3 天 | 几百条能一次处理；阅读页能删单条 |
| I6 | 素材页 | I3、I4、I5 | 2–3 天 | dashboard 里能看到截图 |
| I7 | 截图 / 视频帧存为记录 | I6 | 3–4 天 | 截图变成可检索、可带上下文的记录 |
| I8 | 快照 v1：采集 → 存储 → 最小回看 | I3 | 4–5 天 | 查看器里多一个「快照」视图 |
| I9 | 快照 v2：锚点、截断、版本 | I8 | 3–4 天 | 高亮能在快照上定位；快照有日期与占用说明 |
| I10 | 逐页视觉收口 | I3、I6 | 4–5 天 | 设置、素材、阅读、查看器、popup 与新壳统一 |
| I11 | 工程收口 | 全部 | 2–3 天 | 无（发布门槛达标） |

I2 与 I4 的后半段、I6 与 I8 可以并行开工，但**合并顺序按上表**，避免两个改同一批文件。

---

## 2. 各增量明细

### I1 · 文档债清理

> 状态：**已完成**（2026-11-10）：查看器计划归档并改状态行、注解方向挪 `research/`、两份计划加了顶部定位、`PARKING_LOT.md` 已建。

**做什么**
- `new-viewer.md`（原在 `docs/plan/`）：核对状态行后归档到 `docs/plan/implemented/`，状态改为「已实现」。
- `bundled-annotation.md`（原在 `docs/plan/`）→ `docs/research/`。
- 两份计划的顶部定位：`future-plan` 标「结论集，不是 backlog」；`host-unification` 标「0.7 之后；1.x 第一件事」。
- 修掉文档里指向旧位置的引用。
- 建一个最小的 `PARKING_LOT.md`（仓库根）：一行说明用途 + 一行格式（日期 / 来源增量 / 一句话 / 状态）。

**不做什么**：不改任何代码；不重写这几份文档的内容。

**验收**
- `rg -n "docs/plan/new-viewer|docs/plan/bundled-annotation" docs -g '!release-0.7-increments.md'` → 输出为空（排除本文件，因为它自己就写着这两条旧路径）。
- `git log --follow` 能看到移动记录（用 `git mv`，不要删了重建）。

**动到的模块**：`docs/`。

**用户可见**：无。

**依赖 / 规模**：无 / 0.5 天。

---

### I2 · 工作区骨架：壳 + 图标栏 + 可拖导航

> 状态：**已实现**（2026-11-10）：`WorkspaceShell` / `NavRail` / `ResizeHandle` 已落 `packages/dashboard-ui`，Inbox 与文库已套壳（rail + 可拖 nav + 抽屉 + `<640` 底部导航），panel 拖拽与宽度变量已实现、内容接线留 I3。

**做什么**
- `packages/dashboard-ui` 新增 `WorkspaceShell`、`NavRail`、`ResizeHandle`；宽度状态存本地（不同步）。
- **消费** #114 已加进 master 的 token（`packages/shared/src/theme/tokens.css:65-84`：`--myz-rail-w`、`--myz-nav-w`、`--myz-nav-w-min/max`、`--myz-header-h`、`--myz-row-h*`、`--myz-hit-dense` 等），**不重复声明**。发现缺的才补，并同步写进设计系统。
- 先套到 **Inbox 与文库两页**；行样式一行不动。
- 拖拽：nav 200–320、双击复位、`role="separator"` + `aria-valuenow`、`←/→` 调 8px、`Home` 复位、`Enter` 折叠。
- 断点：`< 900` 抽屉、`< 640` 底部导航（沿用现有 900 断点）。

**不做什么**：不改列表行、不改按钮、不改设置页、不动阅读器与 popup。

**验收**
- `npm run build`、`npm run lint`、`npm run test:e2e` 全绿。
- 手测 1440 / 1280 / 900 / 640 四档：导航可拖、可折叠、刷新后宽度保留、抽屉与底部导航生效。
- 键盘可达：Tab 到分隔条后 `←/→` 调宽，`Home` 复位。

**动到的模块**：`packages/dashboard-ui`、`myz-annotator/src/dashboard`（App / layout / router 外壳）、`packages/shared/src/theme`。

**用户可见**：左侧多一条图标栏，导航可拖宽、可折叠。

**依赖 / 规模**：I1 / 2–3 天。

---

### I3 · 列表行与密度

> 状态：**已实现**（2026-11-11）：`ListRow` / `StatusPill` 已落 `packages/dashboard-ui`；Inbox 与文库列表视图同构为 flush 行（56px、1px 分隔、无卡片壳、动作 hover/触屏常驻），Inbox 选中行接右栏详情（≥1200 内联、<1200 覆盖对话框、<640 底部抽屉）。文库默认视图仍是卡片（用户拍板，列表视图单独同构），卡片/列表切换写进设置并在启动时恢复。

**做什么**
- 新增 `ListRow`、`StatusPill`（`packages/dashboard-ui`）。
- Inbox 先行，文库同构：行 56、无卡片边框、行间 1px 分隔、左侧 3px 状态条；动作只在 hover / 选中时出现，触屏常驻。
- 状态齐全：空、加载（3 行骨架）、错误（inline 重试）、选中、禁用、超长（单行截断 + title）。
- **右栏详情接线**（I2 只留了壳与槽位，这轮接内容）：Inbox 选中一条时展开右栏，显示原文、批注、标签、来源；按设计系统 §4.25，右栏详情替代现有底部抽屉。复用 I2 壳里留好的 panel 槽位与 260–380 clamp，不重做交互；`< 1200` 时改为覆盖式抽屉。
- 删掉 Inbox 行的卡片壳与常驻动作条。

**不做什么**：不改删除行为（I4 才改）；不改批量（I5）；不改按钮基元。

**验收**
- 800px 高列表区可见 **≥ 14 行**（现为 5 行）；给出改动前后同尺寸截图。
- 选中 Inbox 一行 → 右栏展开并显示该条详情；底部抽屉不再出现；`< 1200` 为覆盖式。
- `npm run test:e2e` 中 `inbox`、`highlights` 相关 spec 全绿（选择器随结构调整同步更新）。
- 深浅两套主题各截一屏。

**动到的模块**：`packages/dashboard-ui`、`myz-annotator/src/dashboard/pages/{inbox,highlights}`、`myz-annotator/tests/extension`。

**用户可见**：一屏能看的条目翻倍，列表从「卡片堆」变成可扫视的行。

**依赖 / 规模**：I2 / 2–3 天。

---

### I4 · 删除统一

> 状态：**已实现**（2026-11-11）：`packages/core` 的 undoable delete session + background 删除意图表（落盘、启动/闹钟补提交、读取时过滤未到期 id）；Inbox / 文库 / 查看器 / 阅读器接入同一套语义——单条无批注 6 秒撤销、带批注先确认、批量整批原子且切路由/关页面提交；`window.confirm` 在业务代码里为 0（只剩 `@myz/shared/dialogs` 封装）。四条边界单测见 `packages/core/tests/delete-session.test.ts` 与 `myz-annotator/tests/unit/background/delete-journal.test.ts`。

**做什么**
- 把 `content/highlight/pending-delete.ts` 的延迟删除提成共享纯逻辑（可单测、无 DOM），dashboard 与 content 共用。
- **先定死四条边界语义**（这是上一轮对抗分析指出的隐患，必须在 PR 里写清并有用例）：
  1. 撤销窗口内关闭 dashboard → **提交删除**（不能像现在 `dispose()` 那样丢弃）。
  2. 撤销窗口内切路由 → 提交。
  3. 撤销窗口内写入失败 → 记录恢复，用户被告知。
  4. 批量删除 → 整批原子：全删或全不删。
- 撤销条组件：页面内用行内条（列表场景），浮层场景用 toast；不引入第二套提示。
- 应用：Inbox、文库、查看器（复用 `HighlightActions`）、阅读页单条。
- 带批注的记录走 `ConfirmPopover` 确认、不给撤销；批量里混着带批注的仍走撤销，文案写「已删除 N 条（含 M 条带批注）」。
- 原生确认收口到 `@myz/shared/dialogs` 一处封装，业务调用点清零。

**不做什么**：不做批量选择条（I5）；不做 `Button`/`Dialog` 视觉改造（I10）；不动 `window.confirm` 以外的浏览器原生能力。

**验收**
- `rg -n "window.confirm" myz-annotator/src` → **0 处业务调用**。
- 四条边界各一条单测；两条 e2e：单条删除后撤销、带批注删除走确认。
- 手动：删除 40 条后立刻切路由，回来确认记录**确实不在**。

**动到的模块**：`packages/shared`（或 `packages/core`，择一，PR 里说明理由）、`packages/dashboard-ui`、`myz-annotator/src/dashboard`、`myz-annotator/src/content`。

**用户可见**：删除不再弹系统灰框；删错了 6 秒内能撤销；带批注的记录需要确认。

**依赖 / 规模**：I3 / 2–3 天。

---

### I5 · 批量（文库）+ 阅读页删除动作

**做什么**
- `SelectionBar`（`已选 N`，危险动作靠右）；文库：批量删除、批量打标签、批量导出。
- 「全选」只作用于**当前页**，且显示「已选 N（共 M）」。
- 选择态属于视图：切 tab / 切筛选 / 换搜索即清空；同视图内翻页与滚动加载保留。
- 阅读页：`从列表移除`（撤销，不删文件、不删高亮）+ `清空历史`（确认，不提供撤销），两个动作不同文案。

**不做什么**：查看器不加选择态；缓存区批量见 I6；不做跨页全选。

**验收**
- e2e：选中 3 条批量删除 → 撤销 → 3 条都回来；切换 tab 后选择态清零。
- 手测：文库 500 条时全选只选当前页，计数显示正确。
- `npm run test:dev` 覆盖「选择态随视图切换清空」的行为。

**动到的模块**：`packages/dashboard-ui`、`myz-annotator/src/dashboard/pages/{highlights,readers}`、`myz-annotator/src/messaging/contract.ts` 与 `background/messages/highlights.ts`——**批量导出要改契约**：`myz:export` 现在是 `payload: void`、导出全部记录（`contract.ts:91`、`highlights.ts:77-83`），改成可选 `ids?: string[]`，不传 = 全部（保持现有行为），传了就只导选中的。这不是「不新写」，是向后兼容的契约扩展，PR 里要写明并补一条契约测试。

**用户可见**：文库能一次处理几百条；阅读页能删掉某一本。

**依赖 / 规模**：I4 / 2–3 天。

---

### I6 · 素材页

**做什么**
- dashboard 新增「素材」页与导航项，与「阅读」并列。
- 列表展示缓存项（缩略、类型角标、来源、时间、大小）；可预览原图；单条删除 + 批量删除（复用 I4 撤销条与 I5 选择条）。
- 空态、加载、错误；显示当前占用。

**不做什么**：不做「存为记录」（I7）；不改采集路径；不动 stitch 的入口（用户没点头）。

**验收**
- 采集 3 张图（页面图片、选区截图、视频帧）后素材页可见三张，类型角标正确。
- 批量删除 2 张 → 撤销 → 两张回来。
- `npm run test:e2e` 新增素材页冒烟用例。

**动到的模块**：`myz-annotator/src/dashboard/pages`（新页 + 路由 + 侧栏）、`packages/dashboard-ui`、`background/messages/staged-assets.ts`（只读复用）。

**用户可见**：dashboard 里能看到、能删掉截图，不用再去 popup 里找。

**依赖 / 规模**：I3、I4、I5 / 2–3 天。

---

### I7 · 截图 / 视频帧存为记录

**做什么**
- **记录 schema 的兼容方案（已定，不留到写 PR 时决定）**：在现有 `myz.record` codec 上加**可选字段**（附件引用 = `assetId` + `mime` + 宽高），**不新增 `schemaId`、不升 `currentVersion`**。
  - 判据一：加可选字段向后兼容。`MyZRecordSchema` 是 `.passthrough()`（`packages/shared/src/schemas/records/v1.ts:39`），老客户端解析时保留未知字段，不报错。
  - 判据二：读改写是合并、不是重建。`updateRecord` / `updateRecordsPatch` 都是 `{ ...existing, ...patch }`（`packages/core/src/services/records.ts:154-159`、`:217-222`）；存储层读原对象、写只补 `schemaVersion`（`myz-annotator/src/background/storage.ts:180-183`、`:198-200`）。所以 0.6.6 用户改标签再同步，附件字段还在。
  - 判据三：新 `schemaId` 反而更糟。老客户端遇到不认识的 `schemaId` 只能不物化（`packages/core/src/ports.ts:13-17`、`packages/core/src/payload-codec.ts:20-23`），整条记录对 0.6.6 用户不可见——比「看得见记录、看不见图」更差。
  - `currentVersion + 1` 只用于破坏性变更（字段改名、删字段、改类型）；加可选字段不动版本号。
  - **开工第一件事：实测旧客户端回写不丢字段（半天）**——用 0.6.6 的构建造库，导入一条带附件字段的记录 → 改标签 → 导出，确认字段还在。这条不能只靠读代码推断。
- context 默认带三项、不给关：来源页 URL + 标题、文字上下文（有选区取选区，否则取最近文本块前后约 200 字）、视频时间戳 `mm:ss`（深链 `?t=`）。
- 批注可选、默认收起。
- 批量「存为记录」：context 取公共部分，缺失留空，不逐张补。
- 导出：不含附件，但结果里写明「N 个附件未包含（仅本机）」并给清单。
- 回看：记录卡 16:10 缩略 + 类型角标；视频帧角标显示时间。

**不做什么**：附件同步、换设备恢复（显示「图片在本机」占位）、附件打包导出。

**验收**
- schema 单测：旧记录（无附件字段）读取不报错；新记录往返序列化一致。
- 批量存 10 张 → 生成 10 条记录，公共 context 一致、缺失字段为空。
- 导出后打开 JSON：`attachmentsMissing: {count, ids}` 存在且数量正确。
- 换设备模拟（清本地 store 后加载记录）：显示「图片在本机」，不崩、不空白。

**动到的模块**：`packages/shared`（schema + 类型，加可选字段）、`packages/core`（codec 复用现有 `myz.record`，不新建）、`myz-annotator/src/dashboard/pages`（素材页动作 + 记录卡）、`background/messages/highlights.ts`（导出清单）、`packages/sync-core`（不动：`data: unknown` 原样携带）。

**用户可见**：截图变成一条能搜、能带上下文、能和划线一起看的记录。

**依赖 / 规模**：I6 / 3–4 天。

---

### I8 · 快照 v1：采集 → 存储 → 最小回看

**做什么**
- 独立快照 store（不混进 `staged_assets`）；设总量上限（数值在 PR 里给出实测依据）、LRU 淘汰、写入失败冒泡到 UI、淘汰前提示一次。
- 采集：复用 `content-extraction.ts` 的正文边界 + `zen-config.ts` 站点规则；以 record 为锚向两侧扩展；无限滚动页不采集。
- 最小回看：查看器第二个视图，只渲染正文与高亮，无交互、无锚点精修。
- 只读状态行：「本机快照 · 占用 X MB · 空间不足时最旧的会被清理」。

**不做什么**：不做锚点降级与截断阈值（I9）；不做版本列表；不做差异比对；不做管理界面。

**验收**
- 逼配额：把上限调到 2 份快照大小，采第 3 份 → 最旧的被淘汰、提示出现、不产生半截快照。
- 写入失败（模拟配额 0）→ UI 可见错误，不是静默。
- 普通文章页采集 → 查看器能看到快照；X 首页 → 明确不采集。

**动到的模块**：`myz-annotator/src/background`（新 store + 消息）、`myz-annotator/src/content`（采集）、`myz-annotator/src/dashboard/pages/highlight-viewer`、`packages/shared`（类型）。

**用户可见**：查看器里多一个「快照」视图，能看到当时的页面正文。

**依赖 / 规模**：I3 / 4–5 天。

---

### I9 · 快照 v2：锚点、截断、版本

**做什么**
- 锚点降级：`SerializedRange` → 文本引用 → 「未定位」，绝不猜位置。
- 截断阈值 N：在真实 X 首页与长评论流上量，写进配置并记录依据。
- 顶部状态条：「快照 YYYY-MM-DD · 原页可能已更新」+「打开原页」。
- 同 URL 多份快照 = 版本列表，默认最新，不自动合并。

**不做什么**：不做差异比对、不做合并、不做跨版本高亮迁移。

**验收**
- 同页 20 条记录 + 1 份快照：给出命中 / 降级 / 未定位三类计数基线（写进 PR）。
- 普通文章、SPA 列表流、长评论流各验一次截断规则。
- 改版页面（改前后各存一份）验证「未定位」出现在该出现的地方，且不误标。

**动到的模块**：`myz-annotator/src/dashboard/pages/highlight-viewer`、`packages/shared`（serializer 复用）、快照 store。

**用户可见**：快照上的高亮能定位；能选不同时间的版本。

**依赖 / 规模**：I8 / 3–4 天。

---

### I10 · 逐页视觉收口

**做什么**
- `Button`、`Dialog` 组件进 `packages/dashboard-ui`；吃掉 `.btn` 系列（约 54 处调用）与 `.settings__*`（改为 `SettingsGroup`）。
- 逐页对齐设计系统 v0.6：设置、素材、阅读、查看器、popup、内容浮层（内容层保持手写样式，仅取值同源）。

**不做什么**：不改信息架构与路由（除非布局硬性要求）；不迁 shadcn 词表；不重做配色。

**验收**
- `rg -n "\.btn\b|settings__" myz-annotator/src` → 0（或仅剩过渡层并注明）。
- `npm run check:design-tokens` 通过；新代码无裸 hex 色值。
- 每个面深浅两套主题截图；1440 / 1280 / 900 / 640 四档断点。

**动到的模块**：`packages/dashboard-ui`、`myz-annotator/src/dashboard`、`myz-annotator/src/popup`、部分 content 样式。

**用户可见**：所有页面看起来是同一个产品，不再是「几层拼起来的」。

**依赖 / 规模**：I3、I6 / 4–5 天。

---

### I11 · 工程收口

**做什么**
- 关键路径 e2e 清单：采集 / 高亮 / 删除撤销 / 批量 / 快照回看 / 导入导出 / PDF + EPUB 重开还原。
- 关掉 CI retry 连跑 10 次，记录基线；挂过的用例要么修、要么显式 skip 并写原因。
- `dist` 体积上限进 CI。
- drift check 扩到实现层（禁止裸 hex 色值）。

**不做什么**：不新写功能；不为了覆盖率追数字。

**验收**
- 10 次无重试运行全绿（贴运行号）。
- 体积上限触发一次失败演示（故意超限），证明门禁有效。
- drift check 能对一处人为裸色值报错。

**动到的模块**：`.github/workflows`、`scripts/`、`myz-annotator/tests`。

**用户可见**：无（发布门槛达标）。

**依赖 / 规模**：全部 / 2–3 天。

---

## 3. 停点与并行

- **I2 合入后给用户看一次**（截图 + 一页真机），确认骨架方向再铺 I3。
- **I3 + I4 合入后给用户看一次**：这是本版最直观的变化（密度 + 删除可撤销）。
- I6 与 I8 可并行（不同页面、不同数据表）；但 I7 必须在 I6 之后（同一素材页）。
- 任一增量若发现需要改 `release-0.7.md` 的范围，先停下来说，不在 PR 里顺手改计划。

## 4. 与计划文档的对应

| 计划切片 | 增量 |
|---|---|
| S1 整体设计修订 | I2、I3、I10（token 与组件在 I2/I3 就进，I10 收尾） |
| S2 删除统一 + 批量 | I4、I5 |
| S3 素材页 + 存为记录 | I6、I7 |
| S4 整页快照 | I8、I9 |
| S5 打磨 + e2e | I10、I11 |

## 5. 风险

1. **I7 动数据模型**。它是 0.7 唯一改记录 schema 的增量。兼容方案已定（加可选字段、不升版本），但「0.6.6 回写不丢字段」是推断出来的，必须用那半天实测确认；确认不通过就退回「附件只存素材页、不挂记录」，不要硬上。
2. **I8 的存储预算是新子系统**。上限数值必须有实测依据；「先拍一个数字」会在用户机器上变成淘汰或爆盘。
3. **I4 的边界语义**是上一轮对抗分析指出的最大隐患，四条用例不能省。
4. **I2/I3/I10 改同一批页面**，合并顺序不能乱；并行时不要碰同一个文件。
