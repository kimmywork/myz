# UX Assessment — 2026-09-29

> 对象：仓库 `master` @ `187e6bd`（Inbox v0.5 + 拖拽标签完善）。
> 方法：**第一部分**为对照 `docs/research/design-system/design-system.md`、三份计划与通用可用性原则的**静态代码审计**；**第二部分**为对构建产物（`myz-annotator/dist`）的 **Playwright 动态探测**；**第三部分**为两者结合的总体结论与改进路线。
>
> **独立性限制**：本文档为**自审 + AI 静态审计 + 自动化动态探测**，**不是**独立人工 UX 评审，也未做真人可用性测试与屏幕阅读器实测。对比度若为推算会显式标注；触摸/真机行为未验证。凡「推断」均非实测。
>
> 判定口径：P0 阻断/数据风险；P1 明显影响效率或可达性；P2 打磨。

---

## 0. 覆盖与原则

覆盖面：网页采集（content）、PDF 阅读器、EPUB 阅读器、Dashboard（文库/查看器/设置/Inbox）、Popup。

采用：Nielsen 十项启发式（系统状态可见、撤销与重做、错误预防、识别优于回忆、一致与标准、可达性…）、Fitts（命中区）、Hick（选择负担）、渐进披露、规模化。

环境约束（必须结合）：Chrome MV3、内容脚本隔离世界、宿主页 `Permissions-Policy`、PDF/EPUB 的 iframe、工具定位为**本地优先、键盘友好的标注/阅读工具**（用户高投入、愿学快捷键，但数据不可丢）。

---

## 1. 静态审计结论

### 1.1 键盘与焦点（跨面）

- `myz-annotator/manifest.json` 无 `commands`/`suggested_key`，全仓无 `chrome.commands`/`onCommand` → **无扩展级全局快捷键**；所有快捷键都是页面内、且大多是隐藏的。
- 全仓无 `aria-live` / `aria-modal` / `aria-busy` / `aria-atomic` / `aria-keyshortcuts`（grep=0）→ 异步状态从不播报。
- **Inbox 专注模式**：`InboxPage.tsx:365-383` `onKeydown` 挂在 `window`，只判断 `focusMode`，**不检查 `event.target`**（输入框内打字会触发 K/A/S/D/M/Space）；无 Esc 退出；无进入专注的快捷键；计划 §4.4 的**标签数字键未实现**。可见提示在 `:840-843`。
- **内容采集**：`content/content.ts:40-41` 由 `mouseup`/`keyup` 触发工具条（键盘选区可触发，但不可见、不可发现）；`Modal`/`Inspector` 无 Esc、无焦点陷阱、关闭不归还焦点（`Modal.tsx:195`、`Inspector.tsx:99`）；高亮 span 不可键盘聚焦（`apply-highlight.ts:37` 无 `tabindex/role`）。
- **PDF/EPUB**：`src/pdf/**`、`src/epub/**` **无任何 keydown/keyup**；选区只监听 `mouseup`（`usePdfAnnotations.ts:217`、`EpubReaderApp.tsx:253`）→ 键盘选词/触摸长按不弹工具条；无方向键翻页/章、无 Esc 关侧栏/Inspector；Inspector 无 `role=dialog`/焦点陷阱（`PdfInspector.tsx:33`、`EpubHighlightPanel.tsx:85`）。
- **Dashboard**：`HighlightViewerPage.tsx:454-465` 记录卡片 `article onClick` 无键盘可达；`HighlightActions.tsx:51-122` 图标按钮只有 `title` 无 `aria-label`；`ThemeToggle` 菜单无方向键/Esc/焦点转移；outline 无 `aria-current/aria-expanded`；无路由切换焦点管理。
- 可发现（好）：Inbox 专注键、`TagInput` 回车/删除提示。

### 1.2 拖拽 / 指针 / 选区

- **Inbox**：HTML5 DnD（`InboxPage.tsx:459,649,810`）；已支持多选拖拽、标签↔记录双向、专注卡片拖拽。缺：**键盘/触摸替代**（全仓除翻译浮层外无 Pointer/Touch 监听）；无 `dropEffect`/`dragenter` 视觉反馈（所有目标都 `preventDefault` 显得都可放）；记录落记录、标签落标签**静默无效**；无拖拽手柄/`cursor: grab`；无 `setDragImage`。
- **翻译浮层**：唯一 Pointer Events 拖拽（`TranslationPopover.tsx:79-93`），支持触摸（`translation-popover.css:56` `touch-action:none`）；**缺 `pointercancel` 监听**（`:90-91` 只挂 `pointerup`），系统手势取消后可能残留拖动状态。
- **内容/PDF/EPUB 选区**：分别为原生 selection 与鼠标几何；PDF 块级吸附（三击整段、分栏、缩进）实现强、测试充分；但均为**鼠标专属**。
- **重复实现漂移**：高亮绘制 3 套（`content/apply-highlight.ts`、`pdf/annotations.ts`、`epub/highlights.ts`）；选区→段落 2 套（共享 `selectionBlocks` vs `pdf/text-selection.ts:367-400`）；Esc 处理不一致。

### 1.3 状态 / 规模 / 安全 / 无障碍

- **状态面板**：共享 `StatePanel`（`packages/dashboard-ui/src/StatePanel.tsx`）用于文库/popup/阅读页，但**未用于阅读器、Inbox、任何设置页**；Dashboard 初始化失败仅 `console.error`（`App.tsx:24`），设置加载失败仅 `console.error`（`stores/settings.ts:77`）。
- **规模**：全仓无虚拟列表；仅文库分页 24（`dashboard/constants.ts:1`）。Inbox 全量加载/渲染（`queue.ts:67-84`、`InboxPage.tsx:900-903`）；`PageSidebar` 渲染所有页面分组；PDF/EPUB 标注列表全量；TOC 全量递归。`useInfiniteScroll.ts:16` 默认 `watchTargetSelector=".highlight-groups"` 与根类名（`HighlightGroups.tsx:73 class="space-y-6"`）不匹配 → MutationObserver 分支不生效，靠 watcher 兜底（脆弱）。
- **破坏性动作无确认/撤销**：内容 Inspector/Modal、PDF/EPUB Inspector、Dashboard 卡片、Popup、导入覆盖（见 §2 P0-2）。唯一有防护的是 Inbox 删除（`InboxPage.tsx:268,407`）。
- **状态不显示**：`stores/highlights.ts` 的 `operationStatus` 多处赋值但**无任何渲染**；设置 `settingsStatus` 亦未渲染。
- **无障碍**：异步结果无 `aria-live`；命中区 <32px 见 §3；reduced-motion 覆盖较全，但 JS `scrollIntoView({behavior:"smooth"})`（`HighlightViewerPage.tsx:256`、`highlight-state.ts:505`）会绕过减少动效偏好（推断）。
- **截断**：多处按 UTF-16 切片（`reader/text.ts:6`、`url.ts:155`、`useHighlightItem.ts:65-68`），可能截断代理对。
- **i18n**：全硬编码中文，无 `_locales`，其他语言长文案布局未评估。

### 1.4 设计系统（字体 / 配色 / 组件）

**字体（好）**：`--myz-read`（Newsreader + Noto Serif CJK）与 `--myz-sans` 分工清晰，区域化 CJK 切换（`tokens.css:331-350`）；阅读尺度（`--myz-read-measure:38em`、leading 1.8、tracking）已定义并被消费。问题：规格要求 10px 分组标签，实现用 11px `text-tag`；多处硬编码 11px（`reader-chrome.css:187,455,523,610`、`shadow.css:209,773`）未用令牌。

**配色（需修，对比度为推算）**：
- `slate` 浅色 `--myz-muted #64748b` on `--myz-surface-2 #f1f5f9` ≈ **4.34:1**（< AA 4.5）；`paper` 浅色 muted on surface-2 ≈ **4.50**（临界）。
- `--myz-line`/`--myz-control-border` 对其背景仅 **1.3–1.9:1**，却是输入框/按钮**唯一边界**（`dashboard/styles.css:72,107`）→ 低于 WCAG 1.4.11 的 3:1。
- 半透明 surface 违背规格「实体不 `/90`」：`HighlightListRow.tsx:21` `bg-surface/90`、`FilterToolbar.tsx:26` `bg-surface/80`、`reader-chrome.css:556` `color-mix 18%`。
- 状态 pill 色义合理（pending info；snoozed/archived 中性 + 图标/文字），但 snoozed 与 archived/kept 颜色相同，仅靠文字区分。

**组件/尺寸（需修）**：
- 命中区 <32：阅读器 `.reader-sidebar__tab` 26px、`.reader-status__retry` ~29px、调色盘铅笔 18px、`ToggleSwitch` 24px 高、Inbox 标签移除 `IconClose size=10`、标签 chip ~20px。
- **断点漂移**：规格统一 900，实现混用 `lg:1024`（`FilterToolbar.tsx:30,74`、`DashboardAppShell.tsx:26`）、`sm:640/md:768/xl:1280`（`HighlightGroups.tsx:85`）、`zen.ts:320` 用 768。
- **动效令牌漂移**：`.btn`/字段用 Tailwind 默认 150ms，规格快档 120ms（`tokens.css:70`）。
- 规格过期项：`design-system.md:515` 仍称 PDF reduced-motion「缺失」（已实现）；§4.25 enrichments 已被计划移除（已在 changelog 标注）。

---

## 2. 缺陷与风险清单（静态）

### P0（阻断 / 数据风险）
- **P0-1 Inbox 专注模式按键误伤输入框**：`InboxPage.tsx:365-383` 不检查 `event.target`；搜索/标签框打字即触发动作（`d` 弹确认、`s/a/k/m` 静默改状态）。→ 先在 keydown 里排除输入元素与修饰键，并补 Esc 退出。
- **P0-2 破坏性动作无确认/撤销**：`content/components/Inspector.tsx:161-168`、`Modal.tsx:366-375`、`pdf/components/PdfInspector.tsx:123-130`、`epub/EpubHighlightPanel.tsx:181-187`、`packages/dashboard-ui/src/HighlightActions.tsx:115-122`、`popup/App.tsx:161-169`、导入覆盖 `ImportHighlightsSection.tsx:86-98`。→ 统一「确认 + 5 秒撤销或 Toast」。
- **P0-3 打标签仅拖拽，无键盘/触摸路径**：`InboxPage.tsx:329-342`。→ 行内/详情提供「+ 标签」（复用 TagInput + 数字键）。

### P1（效率 / 可达性）
- **P1-1 规模化退化**：Inbox/阅读器标注列表/来源侧栏全量渲染；标签无分组/上限。→ 窗口化/分批 + 标签分组排序。
- **P1-2 可达性**：无 `aria-live`；无 dialog 语义/焦点陷阱/Esc/焦点归还；高亮与记录卡片键盘不可达；图标按钮无 `aria-label`；outline 无 `aria-current/expanded`；命中区偏小。
- **P1-3 阅读器/采集条缺键盘与触摸**：仅 `mouseup`；无翻页键/Esc。
- **P1-4 状态反馈不可见**：`operationStatus`/`settingsStatus` 未渲染；Inbox 加载中误显示「没有匹配」；失败仅 console。
- **P1-5 Inbox 体验**：批量动作无撤销、无 busy 防重入；「已标记」作顶层导航语义弱；`window.confirm/prompt` 为唯一确认方式。

### P2（打磨 / 一致性）
- 高亮绘制 3 套、分段 2 套、Esc 不一致；内容脚本工具条不可发现；无保存成功 Toast；`useInfiniteScroll` 选择器不匹配；动效/断点/11px 令牌漂移。

---

## 3. 动态探测计划（Playwright）

对 `myz-annotator/dist` 构建产物，用独立 profile 驱动扩展页面，实测并记录：

1. **P0-1 实证**：进入专注模式 → 聚焦搜索框输入字母 → 观察队列是否被改动 / 是否弹出确认。
2. **命中区实测**：Inbox 标签移除按钮、标签 chip、侧栏 tab、`.btn` 等的 `boundingBox` 尺寸。
3. **对比度实测**：从运行中的 `getComputedStyle` 取 `--myz-muted` 与 `--myz-surface-2`（亮/暗），在测试进程计算 WCAG 比值。
4. **Esc 行为**：专注模式按 Esc 是否退出。
5. **`aria-live` 实测**：dashboard DOM 中 `[aria-live]` 数量。
6. **情绪/视觉证据**：Inbox（亮/暗）、文库、设置、Popup 截图。
7. 复用既有 Inbox e2e（拖拽/多选/撤销）作为交互正确性证据。

> 动态探测实现见 `myz-annotator/tests/ux/ux-probe.spec.ts`，观测写入 `myz-annotator/test-results/ux/observations.json`。

## 3.1 动态探测方法与产物

- 命令（需先 `npm run build`）：`npx playwright test ux/ux-probe.spec.ts --config=tests/playwright.config.ts`（在 `myz-annotator/` 下执行）。
- 该用例**不属于**默认 `test:playwright`（只跑 `tests/extension`），需显式调用，作为可复跑的 UX 审计。
- 产物：`myz-annotator/test-results/ux/{observations.json,inbox-light.png,inbox-dark.png,library-light.png,settings-sync-light.png,popup.png}`。

## 3.2 动态实测结果

| 项 | 实测 | 结论 |
| --- | --- | --- |
| **P0-1 专注模式键盘冲突** | 搜索框聚焦时输入 `a`：待处理由 **2 → 1**（归档触发），且搜索框值仍为 `""`（`preventDefault` 拦截了字符）；再输入 `d` 弹出「删除后不可撤销」确认 | **静态结论被实测坐实**：专注模式下搜索框**无法输入**，字符被拦截并触发队列动作；`d` 会弹出破坏性确认。P0 成立 |
| Esc 退出专注 | 按 Esc 后 `[data-testid="inbox-focus"]` 仍可见 | **不退出**（无 Esc 处理） |
| `aria-live` 数量 | dashboard `[aria-live]` = **0** | 异步结果（撤销/状态/同步/导入）**不播报** |
| 命中区实测 | 标签移除按钮 **10×10**；标签 chip **53×21**（高 21 < 32）；行内首个按钮 10×10；侧栏导航按钮 214×37 | 大量控件**低于 32px** 命中基线，与静态结论一致 |
| 对比度实测（默认 paper 方案） | 亮色 `muted #6b6a64`/`surface-2 #eceae0` = **4.50**；暗色 = **6.16** | 默认方案亮色**临界 AA**；暗色良好。注：`slate` 方案亮色 muted/surface-2 ≈ 4.34（静态推算，需单独验证） |
| 多选拖拽打标签 | 选中 2 条后拖其一到标签，`taggedCount = 2` | **多选拖拽有效**，与 e2e 一致（正向） |

**视觉/布局观察（截图）**：
- Inbox：结构清晰，状态 pill（待处理=蓝色 info）、类型 chip、来源与时间、标签 chip、动作（标记/保留/稍后/归档/删除）层次合理；删除为红色文字按钮（符合规格）；不足是**标签移除 `×` 极小**、右侧留白偏多、未显示「最早积压」以外的健康度。
- 文库：卡片布局干净、标签 chip 清晰；行内动作为**纯图标无文字**（仅 `title`），可发现性与无障碍偏弱；删除红色图标合理。
- 设置/同步、Popup：结构正常（Popup 复用 `StatePanel`）。

## 3.3 静态 vs 动态的一致性

- **被实测坐实**：P0-1 键盘冲突、Esc 缺失、无 `aria-live`、命中区偏小。
- **实测正向**：多选拖拽/反向拖拽/专注模式拖拽、单项 5 秒撤销、状态 pill 语义、默认方案对比度基本达标。
- **仍为静态/推断（未实测）**：阅读器与采集条的键盘/触摸缺口、`slate` 方案对比度、大规模性能（无 50k 数据集实测）、破坏性无确认（因需真人确认流程，仅静态审计）、屏幕阅读器输出。

---

## 4. 总体结论与改进路线

### 4.1 总体判定

**修订后方可用于持续使用（revision required）。** 核心链路完整、观感整洁、拖拽标签与同步实现扎实；但存在 **1 个高危键盘冲突（已实测）**、**多处不可撤销破坏（没有键盘/触摸替代）**、**可达性系统缺口**，以及**规模化与设计令牌一致性**问题。对「本地优先、数据不可丢、用户长期投入」的定位而言，P0/P1 应优先处理后再进入功能扩张。

### 4.2 分级改进清单（按优先级）

**P0（立即）**
1. Inbox `onKeydown`：排除 `input/textarea/select/[contenteditable]`、忽略 `meta/ctrl/alt`，补 **Esc 退出专注**；补回归 e2e（把本报告 §3.2 的探测变成断言）。`InboxPage.tsx:365-383`
2. 破坏性动作统一「确认 + 5 秒撤销/Toast」：内容 Inspector/Modal、PDF/EPUB Inspector、文库卡片、Popup、导入覆盖。
3. 打标签提供**键盘/行内入口**（复用 TagInput + 数字键），拖拽保留为快捷方式。

**P1（本迭代）**
4. 异步状态加 `aria-live`；dialog 语义 + 焦点陷阱 + Esc + 焦点归还；图标按钮补 `aria-label`；outline 补 `aria-current/expanded`；命中区统一 ≥32（标签移除/`ToggleSwitch`/阅读器 tab/retry/调色盘铅笔）。
5. 渲染 `operationStatus`/`settingsStatus`，Inbox 加载/错误态用 `StatePanel`。
6. 阅读器与采集条：`selectionchange`/`keyup` 触发选区工具条、Esc 关闭、方向键翻页；触摸用 Pointer Events 包装。

**规模化 & 设计系统（并行）**
7. Inbox 与阅读器标注列表窗口化/分批；标签分组（最近/本来源/全部）+ 上限；来源/页面侧栏加上限。
8. 设计令牌收敛：muted 在 `surface-2` 提升到 ≥4.5（尤其 `slate` 亮色）、`line/control-border` 提升到 ≥3:1、断点统一 900、动效统一 120ms、去半透明 surface、补 10px 令牌或改规格；更新过期规格（PDF reduced-motion、enrichments）。

### 4.3 复现与后续

- 复跑动态探测：`myz-annotator/` 下 `npm run build` 后 `npx playwright test ux/ux-probe.spec.ts --config=tests/playwright.config.ts`。
- 建议把 §3.2 中「打字不得触发动作」「Esc 退出专注」转为常规 e2e（修完之后），并补触摸/屏幕阅读器人工测试。
- **独立性说明**：本报告未做真人可用性测试与独立专家复评；建议在 P0/P1 修复后安排一次 5–8 人的任务型可用性测试（专注处理、打标签、跨设备同步、读者标注）交叉验证。

### 4.4 P0 / P1 修复状态（2026-09-29）

**P0（已完成）** commit `214bd3a`
- P0-1 专注模式键盘：`InboxPage.onKeydown` 排除输入元素/修饰键、Esc 退出；回归 e2e `inbox_focus_mode_ignores_typing_and_esc_exits`。
- P0-2 破坏确认：新增 `@myz/shared/dialogs`，覆盖内容 Inspector/Modal、PDF/EPUB Inspector、文库卡片、Popup 删除与导入覆盖。
- P0-3 打标签键盘/触摸入口：行内「标签」输入（datalist/回车/Esc/失焦）+ 专注模式 1–9 数字键；e2e `inbox_inline_tag_input_adds_tag_via_keyboard`。

**P1（大部分已完成）** commit `ef89c85`
- 已完成：`aria-live`（Inbox 撤销/状态、文库 `operationStatus`、设置 `settingsStatus`，后两者此前从不渲染）；`HighlightActions` 全图标 `aria-label`；outline `aria-current/aria-expanded`；命中区（`.hit-expand`、阅读器 tab 32、retry 32、调色盘铅笔扩张）；Inbox 加载/错误 `StatePanel`；内容 Modal/Inspector `role=dialog/aria-modal`+Esc；PDF/EPUB Esc 关闭 + 方向键/PageUp/Down 翻页/章。
- **P1 遗留（已完成）**：① 焦点陷阱与菜单键盘（Batch 2）；② 阅读器选区键盘/触摸（Batch 3）。详见 §5。

**修复后复测（同一动态探测，`test-results/ux/observations.json`）**
- 专注模式键盘冲突：`actionFiredWhileTyping=false`、`searchValueAfterA="a"`（字符正常输入）、`deleteConfirmWhileTyping=false` → **已修复**。
- `escapeExitsFocusMode=true` → **已修复**。
- `ariaLiveCount=1`（原 0）→ 已有 `aria-live` 区域。
- `tagRemove` 视觉仍 10×10，但 `tagRemoveEffectiveHit=true`（视觉框外 4px 仍命中按钮）→ **命中区已扩张**（伪元素）。
- `multiSelectDrag.taggedCount=2`、对比度（默认 paper 亮 4.50 / 暗 6.16）不变；**配色对比度收敛未做**（延后到 P2-5）。

### 4.5 P2 投入/收益评估与建议顺序

> 执行状态（2026-10-08）：Batch 0–4 已完成；Batch 5 与 E2EE 两项未做，影响见 §5。下表保留原始评估。

> 评级：Effort S(≤0.5d)/M(1–2d)/L(≥3d)；Benefit 低/中/高（用户可感知、风险降低、维护成本综合）；Risk 为回归风险。

| # | P2 事项 | Effort | Benefit | Risk | 备注 |
| --- | --- | --- | --- | --- | --- |
| P2-1 | 截断按 code point（代理对安全） | S | 中 | 低 | CJK/emoji 正确性，同名工具函数（`reader/text.ts`、`url.ts`、`useHighlightItem.ts`） |
| P2-2 | `useInfiniteScroll` 选择器与根类名不匹配 | S | 低 | 低 | 消除脆弱兜底 |
| P2-3 | Esc 一致性收尾（内容工具条/选区取消、Popup） | S | 低-中 | 低 | 阅读器/Modal 已完成 |
| P2-4 | 状态可辨：snoozed/archived 不再同色 | S | 中 | 低 | 无障碍（非仅颜色）；Inbox pill |
| P2-5 | 令牌收敛：动效 120ms、去半透明 surface、10px 令牌/规格 | S-M | 低-中 | 低-中 | 改断点为 900 有视觉回归风险 → 单独小步 |
| P2-6 | 保存成功 Toast/反馈统一 | S-M | 中 | 低 | 复用现有 status-line + `aria-live` |
| P2-7 | 内容采集工具条可发现性（首次提示/帮助） | S | 中 | 低 | 现在按下选区才出现、无说明 |
| P2-8 | 焦点陷阱 + 菜单键盘（ThemeToggle/导出/搜索建议） | M | 中-高 | 低-中 | P1 遗留①；纯可达性 |
| P2-9 | 阅读器选区键盘/触摸（selectionchange/keyup + Pointer Events） | M-L | 高 | 中 | P1 遗留②；触屏用户主要缺口 |
| P2-10 | 标签分组（最近/本来源/全部）+ 上限/排序 | M | 中-高 | 低 | 规模大时明显 |
| P2-11 | Inbox/阅读器标注列表窗口化 | M-L | 高（仅规模大时） | 中 | 需先有规模数据佐证 |
| P2-12 | 高亮绘制统一（3→1）与 PDF 分段复用共享实现 | L | 中 | 高 | 核心链路，先补测试再重构 |

**建议顺序（批次）**
1. **Batch 0 快速打磨（S，低风险）**：P2-1、P2-2、P2-3、P2-4，以及 P2-5 的动效/半透明/10px 部分。
2. **Batch 1 反馈闭环**：P2-6、P2-7。
3. **Batch 2 可达性深度**：P2-8（焦点陷阱/菜单键盘）——把 P1 遗留① 补齐。
4. **Batch 3 触摸/移动**：P2-9（阅读器选区 Pointer Events）与 Inbox 窄屏抽屉/滑动手势——把 P1 遗留② 补齐。
5. **Batch 4 规模化**：P2-10、P2-11（**先采集真实库规模数据再决定是否投入窗口化**）。
6. **Batch 5 重构**：P2-12（高亮绘制统一），仅在测试覆盖足够后立项。

**判定**：P2 多为打磨与一致性，**不应阻塞**当前功能；建议先做 Batch 0/1（低成本、用户可感知），再视移动端优先级决定 Batch 2/3。窗口化（P2-11）与绘制统一（P2-12）投入最大，需数据/测试支撑后再排期。

---

## 5. 已知限制与影响（2026-10-08）

### 5.1 功能完成度
- **已完成**：P0；P1（含原「P1 遗留」的焦点陷阱与主题/导出/搜索菜单键盘）；P2 Batch 0–4（Batch 4 采用「分批 + 上限」而非定高窗口化）。
- **未做（本阶段）**：Batch 5（高亮绘制 3→1 统一）；E2EE 异地 S3「设备邮箱」UI；窄屏详情抽屉与滑动手势。

### 5.2 未做项的功能影响
| 未做项 | 功能影响 | 说明 |
| --- | --- | --- |
| Batch 5 高亮绘制统一 | **无** | 纯重构；只带来维护/一致性风险（三处实现漂移），不改变用户能力 |
| E2EE 异地 S3 设备邮箱 UI | **无核心缺失** | 同机配对已可用（邀请→响应→批准，含 SAS；已用双 profile + mock S3 e2e 验证）；缺的是**自动/异步远程配对**的便利性，crypto（`deviceEnrollment.ts`）已实现待接线 |
| 窄屏详情抽屉 / 滑动手势 | **无核心缺失** | Inbox 已响应式、侧栏可折叠成抽屉、专注模式有点按按钮、行内「标签」输入触摸可用；缺的是**手势快捷**与**底部详情抽屉**。Inbox 拖拽打标签为鼠标专属，但已由行内标签输入覆盖 |

### 5.3 计划已接受限制（与本轮无关，来自 hardening/evolution 计划）
- **写权限撤销**：纯 S3 + 单一静态凭证下做不到；维持抗回滚 + 读侧 PCS，记为已接受限制（如需，可引入最小身份/中继服务）。
- **无 A-only 恢复**：D 只被设备公钥包裹，所有设备丢失即数据不可恢复。
- **首版无 enrichments**：Inbox 不做关键词/代表句/重复/聚类；标签与正文编辑仍为整条 LWW（状态元数据走独立子流）。

### 5.4 性能/规模备注
- 列表采用**分批 + 上限**（Inbox 40、阅读器标注 60、标签/来源 30）；**极端规模（万级）未做定高窗口化/游标分页**，如真实数据触达再评估。
- 前端无虚拟滚动库依赖（未引入）。



