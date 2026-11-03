# 阅读器对照翻译（双语并排）

> 状态：**已实现（B1–B5，2026-10-27）**。`src/reader/translate/bilingual.ts` + `src/reader/bilingual-pane.ts` + `src/pdf/bilingual.ts` + `src/epub/bilingual.ts`，PDF / EPUB 工具栏都接入 `BilingualControl`。单测 21 条、e2e 10 条。

## 背景与目标

选区翻译（`reader-translation.md`）适合查一段话；读整本书时用户想要的是 IMA 那种**并排对照**：左原文、右译文，位置对齐，滚动即翻译。目标：

1. 顶部工具栏一键开启「对照翻译」：首次点击选择目标语言（或自动检测），之后一键用记住的语言打开；换语言只走右侧下拉。
2. 两侧内容位置一致：PDF 按页内固定坐标（多栏、侧栏、图注各自就位），EPUB 逐段对齐。
3. 只翻译**视口内完整可见**的段落，滚动自动续译；已译段落不重复请求（内存 + 本地缓存）。

## 关键决策

1. **范围**：只补 UI/排版/调度；翻译仍走现有端上核心（Chrome Translator + Language Detector、`myz_translate_db` 缓存）。不引入云服务。
2. **分段来源**：PDF 复用选区几何（`linesOf` + `groupIntoBlocks`），EPUB 用块级元素（最内层 `p/h*/li/div…`）。一段 = 一个可独立翻译的段落，保留原文结构。
3. **对齐策略**：两种排版模式共用一套块模型。PDF 用 `anchored`（**固定页内坐标**）：块保留源 `left/top/width`，横向可扩展到同带邻居前为止、纵向以同带下一块为可用槽位，译文超槽时按比例缩小字号（下限 0.62×、绝对 ≥9px）而不是被挪走，因此多栏/图注/标签交错仍成立。EPUB 用 `flow`：保持阅读顺序，保底源高度，长译文把下一块下推。
4. **PDF 双栏**：每页变成一行（`.pdf-page-row`）＝原页 + 同宽译文列；开启时自动缩放到「两列放得下」，关闭恢复原缩放。
5. **EPUB 双栏**：舞台一分为二，右列镜像章节文档坐标并用 iframe 滚动量做 `translateY`，因此逐段对齐且随滚动同步；右列没有自己的滚动条，滚轮事件转发给章节 iframe（滚右列 = 滚原文 = 触发续译）。
6. **调度**：`BilingualSession` 串行批处理（Translator 只能串行），按文本去重、目标语言变更时取消+重放、源语言只检测一次；分块大小/缓存仍由 `translateText` 负责。**引擎按每次请求解析**（`engineProvider`），因为开关是持久化的：重开阅读器时对照模式已经开着，没有任何点击经过 `setEnabled`，构造时捕获的 `engine: null` 会误报「当前浏览器不支持端上翻译」。
7. **目标语言**：菜单列出常用目标语言（默认跟随 UI 语言，中文优先），源语言始终「自动检测」并可手动重新检测。首次点击主按钮必定打开菜单（此时没有记忆语言），选择后写入 `targetChosen`；此后主按钮直接开启/关闭，语言切换只在 `ChevronDown` 下拉里。

## 关键事实（实现依据）

1. `Translator` 严格串行且 `create()` 需要用户手势；开启菜单的点击即激活时机。
2. 翻译缓存的 key 是 `源语言:目标语言:文本哈希`，因此「换目标语言」不会命中旧译文，「重新检测」若得出不同的源语言也会自然重新翻译。
3. PDF 文本层是绝对定位的 span，没有块结构；现有 `groupIntoBlocks` 已能按行距/缩进/字号切段，直接复用。
4. EPUB iframe 是 `sandbox="allow-same-origin"` 的 `srcdoc`，父页面可直接读 `contentDocument` 与 `scrollY`；`render.ts` 的排版 token（`--myz-read*`）也作用于译文列。
5. `.pdf-page` 仍是渲染/淘汰/选区的最小单位；页行只是外层 flex 容器，`pageElements()`/`pageEl()` 选择器不变。
6. 复杂版面（双栏、图片旁标签）在文本层里就是同 `top` 不同 `x` 的多组 span；只要按源坐标摆放，译文自然与原文交错，**不能**再走「按阅读顺序堆叠」的实现。

## 架构

```
工具栏 BilingualControl（PDF / EPUB 共用）
        │ enabled / target / status
        ▼
useBilingual（Vue 状态 + 偏好持久化）
        │ session
        ▼                          ┌───────────────┐
createBilingualSession ── events ─►│ bilingual-pane │（绝对定位块列，共用）
  request(visible blocks)          └───────────────┘
  translateText(batch) ─► engine/cache   ▲              ▲
                                        │              │
                              pdf/bilingual.ts    epub/bilingual.ts
                              （页行/几何/滚动）   （iframe/文档坐标）
```

- `bilingual.ts`（translate 核心）：纯逻辑，可注入 engine/cache，订阅事件 `state|block|reset`。
- `bilingual-pane.ts`：DOM 渲染 + 两趟布局（先读高度再定 top），负责最小高度、pending 骨架、标题样式。
- `pdf/bilingual.ts`：`collectPdfBlocks` 抽取页内段落并计算「同带右界 / 同带下界」；`createPdfBilingualLayer` 维护 pane、监听滚动、判断「完整可见」。
- `epub/bilingual.ts`：`collectEpubBlocks` 抽取章节段落；镜像滚动并请求可见段落。
- `BilingualControl.tsx`：按钮 + 语言菜单（自动检测行、目标语言列表、状态、错误重试）、外部点击/Esc 关闭。

## 增量

### B1 共享调度 + 分块结果回调
- `translateText` 增加 `sourceLanguage?`（跳过重复检测）、`onLanguages`、`onBlock`（逐段回传，供增量排版）。
- 新增 `createBilingualSession`：去重、批量串行、目标切换取消+重放、重新检测、错误重试、取消；`engineProvider` 每次 `request` 重新解析引擎，失败时也记住请求过的块供 `retry()` 重放。
- 引擎解析收敛为 `engine-provider.ts`，选区翻译与对照翻译共用同一实例。

### B2 共享译文列 + 工具栏菜单
- `bilingual-pane.ts`：`anchored` / `flow` 两种排版、最小高度、译文到达即填、pending 骨架、失败回退。
- `BilingualControl`：首次点击开菜单、之后一键开启（`hasTarget`）+ 关闭翻译；`ChevronDown` 拆分按钮唯一负责换语言；目标语言菜单 + 自动检测（含「重新检测」）+ 状态 + 错误条与重试。
- `bilingual.css`：页行、译文列、块状态、菜单、错误条；浅深主题均用 well token。

### B3 PDF 接入
- `buildPages` 生成 `.pdf-page-row`（原页 + `.pdf-bilingual` 列）；`computeCurrentPage` 用页行判定当前页。
- `collectPdfBlocks` 复用几何分段；每块保留页内 `left/top`，宽度补到 3/4 列宽但不超过同带邻居左界，槽位取同带下一块的 `top`。
- 排版走 `anchored`：块钉在源位置，超槽时缩字号，因此双栏/侧栏/图注保持交错。
- 开启时 `engine.fitColumns(2)` 自动缩放让两列同屏，关闭恢复原比例。
- 滚动/渲染回调驱动「只翻译完整可见块」。

### B4 EPUB 接入
- 舞台拆成 iframe + `.epub-bilingual`（内容层），滚动同步 `translateY(-scrollY)`。
- 右列监听 `wheel` 并转发给章节 iframe（含 line/page deltaMode），滚右列即滚原文、继续翻译。
- `collectEpubBlocks` 取最内层块级元素，沿用章节字号；`ResizeObserver` 在侧栏/分栏变化后重新测量。
- 章节切换清空译文列，`bind(doc, win)` 保证先加载后开启也能工作。

### B5 验证与文档
- 单测：session 10 条（去重、单次检测、换目标、重新检测、重试、取消、不支持、逐段事件、引擎延迟解析）+ pane 7 条（含 anchored 固定坐标）+ service 2 条 + language 2 条。
- e2e：`tests/pdf/pdf-bilingual.spec.ts`、`tests/extension/epub-bilingual.spec.ts` 共 10 条（可见块约束、对齐、换语言、二次点击直接开启、关闭/重开走缓存、不支持提示、多栏交错与坐标对应、滚右列滚动原文、刷新后持久化开关仍可翻译（PDF/EPUB））。
- 文档：本文件、`reader-translation.md` 后续项更新、根 `AGENTS.md`、设计系统 §4.26（含 §4.7/§4.22 与变更记录/决定记录）。

## 验证

- `vue-tsc -b`、`eslint` 0 error、annotator 单测 45 文件 / 317 条通过。
- `npm run build` + Playwright：全量 108 条通过（1 条静态服务器 beforeAll 超时属并行环境的偶发，单跑通过）。
- 截图：`/tmp/pdf-bilingual.png`（PDF 双栏、103% 自适应）、`/tmp/pdf-bilingual-columns.png`（双栏杂志页按源坐标交错）、`/tmp/epub-bilingual.png`（EPUB 双栏、逐段对齐）。

## 边界与已知限制

- **只译完整可见段落**：快速滚动跳过的段落要等它再次完整进入视口才翻译（符合「只翻译视口内完整文本」的要求）；半可见段落会保留骨架直到滚到位。
- **EPUB 长译文**：译文比源段落长时后续块下移，局部位置会有偏移；段落/章节起点仍对齐。
- **PDF 长译文**：按槽位缩字号（下限 0.62×、绝对 ≥9px）；极端长译文仍可能轻微溢出到下一块。
- **PDF 扫描件**：没有文本层就没有段落，译文列为空（不报错）。
- **图文混排**：图片、公式不翻译，只译文字段落。
- **同语言**：目标语言与检测到的源语言相同时提示「原文已经是 X」，不产生请求。
- **偏好本地化**：开关与目标语言存 `localStorage`（`myz-pdf-bilingual` / `myz-epub-bilingual`），译文沿用 `myz_translate_db`，都不同步。
- **引擎生命周期**：默认引擎每页一个单例、`pagehide` 释放；测试用 `window.__MYZ_TRANSLATE_ENGINE__` 覆盖，且在每次请求时重新读取，因此「页面加载后再注入」也生效。
- **不做**：段落手动重译/编辑译文、译文写回记录/导出、整本预翻译、PDF 版面还原（表格列宽等）；图片内文字不译。

## 关联文档

- `docs/plan/reader-translation.md` — 选区翻译（同一翻译核心、同一缓存）。
- `myz-annotator/src/reader/translate/bilingual.ts`、`src/reader/bilingual-pane.ts`、`src/reader/BilingualControl.tsx`。
- `myz-annotator/src/pdf/bilingual.ts`、`src/epub/bilingual.ts`。
- `myz-annotator/src/reader/bilingual.css` — 双栏与菜单样式。
