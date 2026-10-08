# 落地设计系统（Tailwind + 自定义 CSS 混合）

## 背景与目标

设计系统草案已成文，见 `docs/research/design-system/design-system.md`（规范）。草案定义了四套配色方案、九级字号、五档阅读字号、语义色、圆角/尺寸/动效 Token，以及 16 个组件的规格。

实现层目前是三套并存的样式源：Dashboard/Popup 用 Tailwind utility 直接写 `slate`/`indigo`；内容脚本用自带的 `--myz-*` 变量与手写 CSS；PDF 阅读器（已完工）另有手写的 `pdf-viewer.css`，且用文字与字符当图标。同一动作在三处长得不一样。

目标：四处 UI 共用同一份 Token；Tailwind 覆盖我们自己的三个页面（Dashboard、Popup、PDF 阅读器），内容脚本继续手写但取值同源；顺带把 PDF 阅读器里属于设计系统的部分（采集条、工具栏、Inspector、侧栏）对齐到设计系统与 Lucide 图标。

## 范围

### 做
- 抽出唯一的 Token 真源，供全部宿主引用，并可从 `@myz/shared` 解析。
- 新增配色方案的持久化设置（schema-first），让四套方案真正可选。
- 为 Tailwind 宿主提供映射层，且**不覆盖 Tailwind 默认主题键**。
- 迁移 Dashboard、Popup、内容脚本、PDF 阅读器四处的颜色、圆角、字号到 Token。
- 内容层保持手写 CSS，取值改为共享 Token；补齐主题跟随。
- PDF 阅读器改用 Tailwind，并把文字/字符图标换成 Lucide，把采集条与 Inspector 换成设计系统样式。

### 不做
- 不重写组件结构、信息架构与交互逻辑。
- 不把 Tailwind 引入内容脚本，也不给宿主网页注入任何全局 reset。
- 不做主题编辑器、不做跟随系统的策略调整。
- 不改 PDF 的渲染与锚点逻辑（`pdf-document`/`annotations`/`pdfLocator` 等）。
- 不改 E2EE sync 协议版本。

## 已确认的关键决策

1. **混合方案**。Tailwind 只用于我们自己的页面；内容脚本与页面上的划线样式继续手写 CSS。
2. **Token 真源是纯 CSS 变量文件**，不含 preflight、不含 utility，能被 Tailwind 与手写 CSS 同时引用。
3. **Token 变量名统一加 `myz-` 前缀**（如 `--myz-surface`）。内容脚本的样式表会被注入任意网页的 `<head>`，无前缀的 `--text`、`--line` 会与宿主页同名变量互相污染。
4. **Tailwind 映射只用不冲突的新键**，不覆盖 `--radius-sm/md/lg`、`--text-sm/base` 等默认键。理由见「关键事实」第 1 条：覆盖会让既有用法静默位移。
5. 映射必须用 `@theme inline`，且验收要针对**子树作用域**而非根级切换（理由见「关键事实」第 5 条）。
6. 保留一层很薄的 `@layer components`（`.btn`、`.field`、`.card`、`.capture-bar` 等），只负责套用 Token，并承载 Tailwind 难以表达的规则（多层阴影、`color-mix` 划线、`20lh` 限高、密度档位）。
7. 深浅色以 `data-theme` 为准；`.dark` 类保留为兼容入口（`shared/theme.ts` 目前两者都写）。
8. PDF 阅读器页纳入本期，作为 Tailwind 宿主之一。

## 关键事实（已核实）

1. **Tailwind 默认主题键已被占用，覆盖面很大。**
   `node_modules/tailwindcss/theme.css`：`--radius-sm:0.25rem`、`--radius-md:0.375rem`、`--radius-lg:0.5rem`、`--radius-xl:0.75rem`；`--text-sm:0.875rem`、`--text-xs:0.75rem`、`--text-base:1rem`。
   仓库现有用量：`rounded-2xl` 36、`rounded-3xl` 14、`rounded-md` 9、`rounded-xl` 5；`text-sm` 67、`text-xs` 53、`text-xl` 5、`text-base` 2、`text-lg` 1。
   若用设计系统的值覆盖同名键，`text-sm` 会从 14px 变 13px、`rounded-md` 从 6px 变 8px，即 76 处既有用法静默位移。

2. **Tailwind v4.3.3**，`@tailwindcss/vite` 在根 `package.json` 并被 `myz-annotator/vite.config.mjs` 启用；`tailwind.config.ts` 为 `darkMode: "class"`，content globs 含 `../packages/dashboard-ui/src/**`。

3. **`@myz/shared` 是显式 `exports` 映射，且全是 `.ts` 入口，没有 CSS 入口。** `@import "@myz/shared/theme/tokens.css"` 目前无法解析，需要在 `packages/shared/package.json` 增加 CSS 导出。

4. **内容层样式是「一份文件、两处注入」。**
   `content/styles/content.css` 被 `content/shadow-dom.ts:1` 与 `content/styles.ts:1` 以 `?raw` 导入；后者经 `ensureContentStyles()` 注入页面 `<head>`（调用点 `content.ts`、`highlight-state.ts`）。文件自带 `:root { --myz-* }`，注释即写明是为避免影响宿主页默认值。
   `?raw` 返回原始文本、不经 Vite 的 CSS 管线，所以文件内的 `@import` 不会被解析。
   实测：`content.css` 中 `data-theme`/`.dark` 出现 **0 次**——内容层 UI 目前恒为深色。

5. **`@theme inline` 的真实约束在子树作用域，不在根级。**（已用真实构建验证，见文末「验证记录」）
   非 inline 时 Tailwind 把主题变量发到 `:root, :host`，写成 `--color-surface: var(--myz-surface)`，在声明处解析后向下继承。因此主题挂在 `documentElement`、甚至挂在 Shadow 宿主上都能生效。
   真正会失效的是**把主题下放到子树元素**（内容层浮层、设置页预览、shadow 树内部再覆盖）：子树重定义 `--myz-surface` 不会改变祖先已解析的 `--color-surface`。此时必须 `inline`，让 utility 在使用处直接引用 `var(--myz-surface)`。

6. **PDF 阅读器当前不具备 Tailwind 条件。**
   `src/pdf/pdf-viewer.html` 无 CSS 链接；`src/pdf/main.tsx` 导入 `./pdf-viewer.css`；该文件未 `@import "tailwindcss"`，所以页面里没有 utility 可用，且引入 Tailwind 会同时带来 preflight。

7. **PDF 的图标与文案偏离设计系统。**
   `PdfToolbar.tsx` 用 `☰`、`−`、`+` 字符与文字按钮；`PdfSelectionToolbar.tsx` 用文字按钮「高亮 / 保存文字 / 取消」。`src/pdf` 下没有任何 `@myz/shared/icons` 或 Lucide 用法。「保存文字」也违反文案表的「摘录」。

8. **配色方案需要改设置 schema。**
   `myz-annotator/src/background/settings/schemas/v1.ts` 是普通 `z.object`（未知键会被剥离），默认值在 `background/constants.ts`，文档在 `docs/knowledges/schemas/settings/v1.md`。新增字段必须同时改这三处，否则读回时被丢弃。

9. **既有验证资产**：`npm run build`、`npm run test:playwright`、`npx playwright test tests/pdf`（22 项）、`npm run jscpd`、`npm run jscpd:check`。PDF 侧测试依赖 `reader-*`/`pdf-*` class 与 `window.__MYZ_PDF__` 后门。
   `docs/plan/pdf-support.md` 已有「视觉验证约定」：稳定画面用 `toHaveScreenshot` 建基线，含字体/网络不确定因素的改存产物供人工核对，产物不污染默认 e2e。

## 假设

- Token 以 `packages/shared/src/theme/tokens.css` 为真源，与 `design-system.md` 保持一致。
- 主题切换入口都走同一个 `useThemePreference`，不会出现两处状态。
- 迁移期间允许外观变化（圆角、阴影、字号统一必然改变观感），以设计系统为准而非以现状为准。
- Popup 与 Dashboard 共用同一套 Tailwind 配置，无需额外构建目标。

## 边界与限制

- **宿主页不可控**：内容脚本样式与任意网页共存，必须始终保持前缀与低特异性。
- **同一份 content.css 同时服务 shadow 与页面**，是当前的结构性隐患，需要拆分。
- **PDF 页引入 Tailwind 会带来 preflight**：该页是扩展页，preflight 可接受，但 `pdf-viewer.css` 已自带 `html, body` 规则，需验证顺序与覆盖关系。
- **视觉回归以人工判断为主**：`toHaveScreenshot` 对字体加载与抗锯齿敏感。
- **展示页是文档，不是实现范例**，其写法不要求与宿主一致。

## 风险

1. **映射键冲突导致全站静默位移**（见关键事实 1）。缓释：只用新键（`--radius-chip/tag/control/panel`、`--text-body/label/caption`），并在映射层加一条「禁止出现 Tailwind 默认键名」的清单检查——注意 `--radius-xs` 到 `--radius-4xl`、`--text-xs/sm/base/lg/xl` 都在默认键里，不能借用。
2. **`@theme inline` 验收写错方向**（见关键事实 5）。缓释：探针必须把主题作用域挂到**子树元素**上再断言，根级与 Shadow 宿主级切换都能通过、不足以验收。
3. **`?raw` → `?inline` 的行为差异**：`?inline` 会走 Vite 的 CSS 管线（解析 `@import`、`url()`），产物与注入时机可能变化。缓释：单独验证一次，保留「构建期拼接」作为回退。
4. **宿主页变量污染**：缓释同决策 3，并加「注入页面的样式表不含 `:root` 变量声明」的断言。
5. **`--hit-*` 没有 Tailwind 命名空间**，密度档位容易在迁移中丢失。缓释：密度只由组件层类（`.btn-compact/regular/touch`）承载，禁止散写 `h-8/h-9/h-11`。
6. **PDF 页 preflight 与既有样式冲突**，可能导致阅读器整页错位。缓释：先只引入映射层与 Token（不引 preflight）验证一次，再决定是否引完整 Tailwind；PDF 的 e2e 必须全绿。
7. **PDF UI 重构可能破坏既有 e2e 依赖的 class 名与后门**。缓释：类名与 `__MYZ_PDF__` 方法保持兼容；确需改名时在同一次提交内更新 specs。
8. **jscpd 阈值**：抽 Token 与组件类可能引入新重复片段，每步跑 `npm run jscpd`。
9. **大范围替换难以定位回归**。缓释：按宿主分批提交，每批附截图证据。
10. **设置 schema 变更可能影响旧数据读取**。缓释：新字段设默认值并在读取时兜底，不改 `SETTINGS_SCHEMA_VERSION`。

## 增量

### INC-1 Token 真源、命名与导出
**产出**：`packages/shared/src/theme/tokens.css`（纯变量，无 preflight/utility，`--myz-*` 前缀）；`packages/shared/package.json` 增加 `"./theme/tokens.css"` 导出；`design-system.md` 与展示页同步改名。
**前置**：无。
**动作**：搬入四套方案 × 深浅色、语义色、划线五色与透明度、字号九级、阅读五档、圆角、密度、动效、阴影；`:root` 放默认（米纸 · 浅色），`[data-scheme]` 与 `[data-theme="dark"]` 覆盖；建立「旧名 → 新名」对照（内容层 `--myz-accent` 等）。
**验证**：写校验脚本解析 `tokens.css` 与 `design-system.md`，断言 token 名与 hex 值双向一致；`npm run build`；在 Vite 里 import 一次该 CSS 确认可通过 `exports` 解析。
**完成标准**：Token 文件成为唯一真源；导出可解析；校验脚本可入 CI。

### INC-2 配色方案设置（schema-first）
**产出**：设置新增配色方案字段；设置页可切换四套方案；各宿主读取并落到 `data-scheme`。
**前置**：INC-1。
**动作**：
- 改 `background/settings/schemas/v1.ts` 增加字段（枚举 `paper|slate|celadon|ochre`，默认 `paper`），`background/constants.ts` 补默认值，`dashboard/stores/settings.ts` 读取兜底。
- 同步 `docs/knowledges/schemas/settings/v1.md`。
- 设置页新增「配色方案」分组（4 个选项 + 预览），复用现有设置路由与侧栏结构。
- `shared/theme.ts` 或新增 `scheme.ts` 负责写入 `data-scheme` 并广播变更，供各宿主订阅。
**未决**：settings bundle 是否随 E2EE 同步——先确认；若不随，本期只做本地持久化并在文档中标注。
**验证**：单测（默认值、非法值兜底、往返）；e2e：切换方案后刷新仍生效、各宿主 `data-scheme` 同步变化。
**完成标准**：用户能真正换方案，且选择被持久化。

### INC-3 Tailwind 映射层
**产出**：`packages/shared/src/theme/tailwind.css`（`@theme inline` + `@custom-variant dark`）；`src/dashboard/styles.css` 引用它。
**前置**：INC-1。
**动作**：映射颜色（`--color-bg/surface/surface-2/text/muted/line/accent/on-accent/warn/error/success/info`）、字体（`--font-ui/read/mono`）、圆角（**全新键** `--radius-chip` 4 / `--radius-tag` 6 / `--radius-control` 8 / `--radius-panel` 12）、字号（**全新键** `--text-body` / `--text-label` / `--text-caption` 等）、阴影（`--shadow-*`）。
注意 `--radius-xs` 到 `--radius-4xl` 全部是 Tailwind 默认键，`--radius-control/panel/chip/tag` 才安全。
**验证**：
- 「禁止覆盖默认键」清单检查（脚本比对映射键与 `node_modules/tailwindcss/theme.css` 的键集合）。
- 子树作用域探针：把 `data-theme`/`data-scheme` 挂到一个**子容器**上，断言其内 `bg-surface text-muted` 的 computed 值随容器变化。
**完成标准**：映射不冲突；探针入库并通过。

### INC-4 Dashboard 迁移
**产出**：`packages/dashboard-ui/**` 与 `src/dashboard/**` 的调色板硬编码替换为 Token utility；组件类改读 Token；圆角与字号归并。
**前置**：INC-3。
**动作**：替换 `slate/indigo/rose/teal/amber/emerald/sky` 硬编码；`rounded-2xl/3xl` → `rounded-control/panel`；`text-xl/lg/sm/xs/[11px]/[10px]` → 新字号键；去掉 `shadow-xl/2xl` 或改 `--shadow`。
**验证**：`npm run build`、`npm run test:playwright`、`npm run jscpd`；四套方案 × 深浅共 8 张截图（稳定画面用 `toHaveScreenshot`，不稳定画面存产物人工核对）。
**完成标准**：Dashboard 内不再出现 Tailwind 调色板硬编码；8 组外观语义正确。

### INC-5 Popup 迁移
**产出**：`myz-annotator/src/popup/**` 同上迁移。
**前置**：INC-4。
**动作**：替色、归并圆角与字号；记录行改用共享色条与类型样式。
**验证**：`npm run build`、`test:playwright`；Popup 8 组外观截图。
**完成标准**：Popup 与 Dashboard 观感一致，无第二套色值。

### INC-6 内容层接入共享 Token
拆成两步，避免把行为变更藏在重构里。

**INC-6a 纯重构：换取值来源**
**产出**：`content.css` 拆为 shadow 版与 page 版；`?raw` 改为 `?inline`；shadow 版引用共享 Token。
**前置**：INC-1。
**动作**：拆文件并更新 `shadow-dom.ts`、`styles.ts` 的导入；page 版剥离所有变量声明，只留低特异性的 `.myz-highlight*` 规则；清理无对应 TSX 的死规则。
**验证**：读注入后的 `style[data-myz-annotator-style]` 文本，断言不含 `:root` 与变量声明；在「宿主页自带同名 `--text`/`--surface`」的 fixture 上验证宿主页不受影响；采集/划线/批注/禅定相关 e2e 全绿。
**完成标准**：取值同源、页面注入零变量污染，且行为与迁移前一致（外观不作要求）。

**INC-6b 行为：内容层跟随主题**
**产出**：内容层浮层（批注面板、Inspector）随 `data-theme` 与所选方案变化；采集条保持固定深色。
**前置**：INC-6a、INC-2。
**动作**：给 shadow 版补 `[data-theme]`/`[data-scheme]` 分支；把浮层配色从旧的 `--myz-*` 常量改为 Token；确认采集条仍为固定深色。
**验证**：4 套方案 × 深浅共 8 组，在浅色与深色网页上各截一组图（浮层压在白底与深底网页上）；e2e 断言切换主题后浮层 computed 背景变化。
**完成标准**：内容层与产品观感一致；采集条在所有组合下都清晰可辨。

### INC-7 PDF 阅读器 Tailwind 重构与组件对齐
**产出**：PDF 页改用 Tailwind + Token；文字/字符图标换成 Lucide；采集条与 Inspector 换成设计系统样式。
**前置**：INC-3（映射层稳定）。
**动作**：
- 在 PDF 入口引入映射层（先只引 Token + `@theme`，验证 `pdf-viewer.css` 的 `html, body` 规则与 preflight 的先后关系，再决定是否引完整 Tailwind）。
- `PdfToolbar`：`☰ → Menu`、`−/+ → Minus/Plus`、翻页用 `ChevronLeft/ChevronRight`、打开文件用 `FolderOpen`；补齐 `aria-label`；高度、按钮圆角、底色改 `--well-*` Token，跟随方案与深浅色。
- `PdfSelectionToolbar`（采集条）：改为设计系统 §4.7 的形态——固定深色胶囊、Lucide 图标（Highlighter / Clip / Crop / Search）、32 命中区、`--overlay*` Token、深色投影 + 浅色描边；文案「保存文字」改为「摘录」。
- `PdfInspector`：配色改用**用户调色盘**而非 `DEFAULT_COLORS`；标签改用共享 `TagInput` 取代逗号输入；按钮与输入框走组件层；图标用 Lucide。
- `PdfSidebar` / `PdfOutlinePanel` / `PdfHighlightsPanel`：折叠箭头与条目图标换 Lucide，层级样式按设计系统 §4.10；沿用 §4.11 浮动目录的收合行为。
- 保持 `reader-*` / `pdf-*` class 与 `window.__MYZ_PDF__` 方法兼容；确需改名时同一次提交更新 specs。
**验证**：`npm run build`；`npx playwright test tests/pdf` 全绿；8 组外观截图；采集条在浅色与深色 PDF 页面上各截一张。
**完成标准**：PDF 页与其余宿主共用 Token；界面无文字/字符图标；采集条与 Inspector 符合设计系统；PDF 内容始终为原页颜色。

## 执行顺序理由

INC-1 先解决「一套名字、一个真源」，并在命名阶段消除宿主页污染风险。INC-2 保证迁移有用户可见产出，否则整件事的收益无法验证。INC-3 用一个可断言的子树探针确认映射真的跟随变量，且不覆盖默认键，避免 76 处既有用法静默位移。INC-4 从测试覆盖最好的 Dashboard 开始，再复制到 Popup。INC-6a 与 Tailwind 线无关，可与 4/5 并行；6b 依赖 INC-2。INC-7 最后做，因为它同时依赖映射层与内容层的经验。

## 验证记录

**2026-09-17 · Tailwind v4 `@theme` 与 `@theme inline` 的产物形态**

用仓库内的 `@tailwindcss/vite`（v4.3.3）构建最小样例（`@import "tailwindcss"` + `@theme{--color-surface:var(--myz-surface)}`），产物：

```css
@layer theme { :root,:host { --color-surface: var(--myz-surface); … } }
@layer utilities { .bg-surface { background-color: var(--color-surface); } }
@layer base { …preflight… }
```

结论：
- 主题变量发到 `:root, :host`，所以根级与 Shadow 宿主级都能生效；「不写 `inline` 就不跟随主题」的说法不成立。
- `inline` 的差别在使用处引用：非 inline 是 `var(--color-surface)`，inline 是 `var(--myz-surface)`。只有子树作用域才需要后者。
- 同时确认 `@import "tailwindcss"` 会带上 preflight（`@layer base`），对应风险 6。

---

# 第二轮：对齐 v0.2 规范

> 状态（2026-09-20）：INC-8..16 已实现并合入；另追加了共享阅读器 chrome（`src/reader/reader-chrome.css`）与共享高亮绘制（`@myz/shared/highlightRange`）、设置表单行布局（§4.23）。剩余可选项：PDF/EPUB 的工具栏/落地页进一步合并、`ReaderStage` 抽象。

第一轮（INC-1..7）建立了 Token 真源与四处宿主迁移。随后完成了 `design-system.md` v0.2 修订（补齐设置、内容层批注、列表/侧栏、弹窗、PDF 组件与跨切映射，见 §7）。本轮把实现对齐到 v0.2，闭合差距盘点的 B 类差异与新增规范。

## 本轮差距盘点（已核实，带路径）

| 元素 | 规范 | 现状（证据） | 增量 |
| ---- | ---- | ------------ | ---- |
| 非浮层阴影 | §3.7 只允许浮层投影 | `HighlightCard.tsx:24` `shadow-float`；`HighlightGroups.tsx:71` `shadow-inner`；`HighlightsPaneShell.tsx:40`、`PageSidebar.tsx:42`、`SettingsLayout.tsx:11` `shadow-float` | INC-8 |
| 当前项 / 选中态 | §4.10 列表项浅底+强调色文字 | `SettingsSidebar.tsx:47` `bg-accent text-on-accent`；`PageSidebar.tsx:81` 用 `bg-accent/10` 无 accent-text | INC-8/10/11 |
| 禁用 | §4.4 45% | `ToggleSwitch.tsx:32`、`RecordModal.tsx:232` `opacity-60`；`HighlightViewerPage.tsx:314` `opacity-40` | INC-8 |
| 命中区 | §3.9 ≥32 | 卡片操作 `p-1.5`(≈28)、标签 `+N` h22、`RecordModal` 关闭、PDF 关闭/折叠 <32 | INC-8 |
| 聚焦圈 | §3.9/§4.4 | 多处 `:focus-visible` 缺失（列表动作、PDF 控件） | INC-8 |
| 动效 | §3.8 用 Token | 大量裸 `transition`；PDF 缺 reduced-motion | INC-8/14 |
| 文案 | §5 | `HighlightViewerPage.tsx:399` 无可展示内容；`HighlightCard.tsx:105` 无标签；`RecordModal.tsx:141/178` 无批注/无标签；`SyncSection.tsx:289` Manifest 版本；`PdfHighlightsPanel.tsx:12` 「文字」 | INC-8 |
| 状态组件 | §4.15 | `HighlightGroups` 加载/空是纯文本；Popup/PDF 同样 | INC-9 |
| 瀑布流/分组 | §4.9/§4.10 间距 12、组标题 10 大写 | `HighlightGroups.tsx:74` `text-compact`、`:79` `gap-2`(8) | INC-10 |
| 导出菜单 | §4.12 | `HighlightsPaneShell.tsx:189` `▼`、`:192` `rounded-control` | INC-10 |
| 设置字段/调色盘 | §4.6/§4.14 | `.field` gap 8 / 14 号；调色盘是方块+文本框 | INC-11 |
| Popup 头部/搜索 | §4.21/§4.6 | `App.tsx:240` `h-10 w-10 rounded-full`；搜索仅边框变色 | INC-12 |
| 内容层 Inspector | §4.18 280 可就地编辑 | 现为只读 note + 三图标；点开弹窗编辑 | INC-13 |
| 内容层弹窗 | §4.8 关闭用 Lucide、聚焦 3px | `Modal.tsx` 关闭 `×` 字符、字段 label 大写、聚焦 2px | INC-13 |
| 设置锁定宽度 | §4.8 采集编辑弹窗 320 | `Modal.tsx` `min(320px,…)` 已符；仅补规范落点 | INC-13 |
| PDF 顶栏/侧栏 | §4.22 顶栏 44、侧栏 240 | `pdf-viewer.css:47` 顶栏 padding 10（≈52）；`:529` 侧栏 280 | INC-14 |
| PDF 标注面板 | §4.22 | `PdfHighlightsPanel.tsx:12` 「文字」、搜索/筛选高度不足、行用 `surface-2` | INC-14 |
| PDF 原页/选中 | §4.22 | `pdf-viewer.css:127/535` 写死阴影；`:141` 选中 `rgba(56,189,248,.4)` | INC-14 |
| 专注阅读主题 | §4.16 跟随方案与深浅色 | `zen.ts` 写死 `#f5f4ed/#141413` | INC-15 |
| RecordModal | §4.8 并入查看器 | `RecordModal.tsx` `max-w-5xl` + 遮罩仍在 | INC-16 |

## 范围

**做**：闭合上表；把 v0.2 新增规范落到实现；保持 `reader-*` / `pdf-*` class 与 `window.__MYZ_PDF__` 兼容。

**不做**：不改 PDF 渲染与锚点逻辑、不改 E2EE 协议、不做主题编辑器、不重排信息架构、不做专注阅读字号控件（功能后期整体重做）。

## 风险

1. **e2e 依赖 class 与截图**：PDF 的 `reader-*`/`pdf-*` 与 `window.__MYZ_PDF__` 必须兼容；外观改动会移动截图基线，需按 `docs/plan/pdf-support.md` 的视觉验证约定更新。
2. **`jscpd` 阈值**：抽公共 class（列表行、状态组件、侧栏）可能触发重复，每增量跑 `npm run jscpd`。
3. **状态组件跨宿主**：空/加载/错在 dashboard、popup、PDF 三处出现，先抽共享再铺开，避免三份实现。
4. **阴影移除影响层级**：去掉非浮层阴影后要确认深色下分组/卡片的边界仍清楚（靠 `--myz-line` 与抬高低色）。
5. **内容层不可污染宿主页**：任何新样式仍只进 Shadow；`page.css` 不得声明变量（第一轮约束延续）。

## 增量

### INC-8 跨切：阴影、选中态、交互态、动效、文案、断点
**产出**：规范 §3.7/§3.8/§3.9/§4.10/§5 的实现对齐。
**前置**：无。
**动作**：
- 移除 `HighlightCard`/`HighlightGroups`/`HighlightsPaneShell`/`PageSidebar`/`SettingsLayout`/`HighlightViewerPage` 的非浮层阴影；浮层（下拉、弹窗、Inspector、采集条、浮动目录、toast）保留。
- 选中态：列表/导航/侧栏统一 `--myz-surface-2` 底 + `--myz-accent-text` 文字；分段控件与分页保留实心强调色（§4.10）。
- 交互态：所有可点元素补 `:focus-visible` 强调色 2px 偏移 2；禁用统一 `.45`；图标动作/标签 `+N`/关闭按钮用 padding 或 `::before` 把命中区扩到 32。
- 动效：被 §3.8 点名的组件（采集条/浮层/侧栏/抽屉/提示条/PDF 面板）显式用 motion Token；其余裸 `transition` 保留 Tailwind 默认 150ms（≈fast）——`--default-transition-duration` 是 Tailwind 默认键，按「不覆盖默认键」规则不能改；补 PDF `prefers-reduced-motion`。
- 文案按 §5：`无可展示内容→这里还没有内容`、`无标签→还没有标签`、`无批注→还没有批注`、`Manifest 版本→同步版本`、PDF「文字」→「摘录」。
- 断点：单栏/抽屉断点从 `lg`(1024) 改 900。
**验证**：`npm run build`、`npm run lint`、`npm run test:playwright`；聚焦圈/命中区的 computed 断言；四方案×深浅截图。
**完成标准**：非浮层零阴影；禁用/聚焦/命中区全站一致；文案表命中。

### INC-9 状态组件统一（§4.15）
**产出**：共享的空 / 骨架 / 出错 / 提示条组件（dashboard-ui 与内容层各一版，PDF 复用其 class）。
**前置**：无。
**动作**：按 §4.15 实现骨架条（`--myz-skeleton`、错落宽度、reduced-motion 停微光）、空状态（图标 + 状态 + 下一步）、错误重试（次要按钮）、toast（`--myz-overlay`、3–4s、最多 3 条、贴近操作）。
**验证**：`HighlightGroups`、Popup 列表、`PdfOutlinePanel`、`PdfHighlightsPanel` 四处接入；单测 + 截图。
**完成标准**：四处加载/空/错都有形，不再是纯文本。

### INC-10 文库与记录列表（§4.3/§4.9/§4.10/§4.12/§4.19/§4.20）
**前置**：INC-8。
**动作**：瀑布流列/行间距改 12；分组头 10 大写 + 组间细线；卡片来源行 11、正文行高 1.55–1.6、类型 chip 用 `--myz-tag-*`；新增列表视图行 §4.20；视图/排序用分段控件 §4.19；来源侧栏宽 264、去阴影、当前项按 §4.10；导出按钮 `--myz-r` + `ChevronDown` + 菜单 §4.12；页面筛选 chip；标签 `+N` 命中区。
**验证**：`test:playwright` + 截图；`jscpd`。
**完成标准**：文库内无 Tailwind 调色板硬编码与第二套选中态。

### INC-11 设置页（§4.17/§4.6/§4.14）
**前置**：INC-8。
**动作**：分组卡去阴影、标题 17/600 + 说明 12；字段 label 12 / 距 6（改 `.field`）；下拉/日期/文件统一 §4.6；开关聚焦圈；侧栏分组标题 10 大写、当前项浅底+accent-text、宽 240；调色盘按 §4.14 重做（圆 32、间距 8、居中、铅笔角标、默认色单独一行、可读色名、恢复默认）；配色方案卡保留；保存反馈用行内状态。
**验证**：`test:playwright`（settings 相关）+ 截图。
**完成标准**：设置页与记录卡同一套 Token 与交互态。

### INC-12 Popup（§4.21/§4.6/§4.3/§4.15）
**前置**：INC-8/9。
**动作**：头部卡 `rounded-panel` 实色；图标按钮 32/`rounded-control`；搜索 3px 20% 聚焦光圈；类型徽标用 tag/clip token；批注文字改长文衬线 + `--myz-text`；来源行 11；加载/错误/空接 INC-9。
**验证**：`test:playwright` + popup 截图。
**完成标准**：Popup 与 Dashboard 观感一致。

### INC-13 内容层浮层（§4.18/§4.8/§4.5/§4.14/§4.7）
**前置**：INC-8。
**动作**：完整 Inspector 按 §4.18（280、可就地编辑批注与标签、窄屏抽屉、引用/批注用长文衬线 14、批注正文色）；紧凑三按钮条保留固定深色并补聚焦；样式选择器用 tag-bg+accent 边；`Modal.tsx` 关闭换 Lucide `X`、字段 label 去大写、聚焦 3px、宽度对齐 320；TagInput 紧凑 32、当前项 accent-text；调色盘按 §4.14；采集条补 180ms 淡入并去掉 `scale`；toast 位置与堆叠按 §4.15。
**验证**：内容层 e2e（采集/划线/批注/禅定）+ 浅色/深色网页截图。
**完成标准**：浮层跟随主题、固定深色只在采集条与紧凑条。

### INC-14 PDF 阅读器（§4.22）
**前置**：INC-8/9。
**动作**：顶栏 44；侧栏 240、分页签用分段控件 + accent-text；目录两层/字号归九级/当前态/加载空错；标注面板「摘录」、筛选命中区 32、搜索 32+聚焦、行底 `--myz-well-control-bg`、标签 20、空态图标；保存/删除按 §4.4；标签用共享 `TagInput`；调色盘含可读色名；样式 chip 当前态 accent-text；原页阴影用 `--myz-shadow`、选中底色用 `--myz-mark-4` 40%、clip 70% 虚线；标记圆角 3/下划线 2/波浪 1.5；跳转闪烁与面板动效；reduced-motion。
**验证**：`npm run build`、`npx playwright test tests/pdf` 全绿；8 组外观截图；采集条浅/深 PDF 截图。
**完成标准**：PDF 页与其余宿主共用 Token；界面无字符图标。

### INC-15 专注阅读跟随主题（§4.16）
**前置**：INC-8。
**动作**：`zen.ts` 纸色/文字/链接改用按方案与深浅色的值（仍内联，不污染宿主页）；字体族按地区（已完成）。
**说明**：字号/行距/栏宽控件本轮不做。
**验证**：浅色/深色 × 四方案的 zen 截图。
**完成标准**：专注阅读纸色随主题，不再是写死浅色。

### INC-16 RecordModal 并入查看器（§4.8）
**前置**：INC-10。
**动作**：把 `RecordModal` 的编辑能力并入 `HighlightViewerPage`（编辑批注与标签、跳上/下一条），移除 `max-w-5xl` 大对话框；确需就地提示时用 §4.15。
**验证**：查看器 e2e；删除 `RecordModal` 相关断言。
**完成标准**：记录阅读与编辑都走查看器页面。

## 执行顺序理由

INC-8 是全局底座，先做避免每页重复改。INC-9 状态组件跨三宿主，早抽出。INC-10/11/12 是三个 Tailwind 宿主，从覆盖最好的 Dashboard 起。INC-13 与 Tailwind 线无关，可与 10/11/12 并行（注意不冲突同一文件）。INC-14 体量最大且 e2e 最重，放在宿主经验之后。INC-15/16 是收尾的行为对齐。

## 本轮验证约定

- 每增量至少：`npm run build`、`npm run lint`、相关单测；涉及 UI 的加 `test:playwright` / `npx playwright test tests/pdf`。
- 稳定画面用 `toHaveScreenshot` 建基线；不稳定画面存产物人工核对（沿用 `docs/plan/pdf-support.md`）。
- 合并前跑 `npm run check:design-tokens`、`npm run check:tailwind-keys`、`npm run jscpd`。
- 外观矩阵：四方案 × 深浅共 8 组，重点宿主各截一组。

## 关联文档

- `docs/research/design-system/design-system.md` — 设计系统规范（Token、组件、规则）。
- `docs/plan/pdf-support.md` — PDF 阅读器实现现状与视觉验证约定。
- `docs/knowledges/schemas/settings/v1.md` — 设置 schema。
