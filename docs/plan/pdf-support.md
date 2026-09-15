# PDF 阅读与摘录（P0）增量计划

## 背景与目标

MyZ 已完成"网页采集 → 查看/展示"的闭环。下一步的真实高频需求是**阅读文档并摘录**，因此把 PDF 支持作为 P0。

目标：用户能通过扩展**显式打开**本地或网页 PDF，在内置阅读器中阅读、选中文本摘录、加批注，并在重新打开同一 PDF 时**还原高亮**；摘录以 MyZRecord 形式进入现有 Dashboard 查看链路。

## 范围

### 做
- 扩展内自建 pdf.js 阅读器（显式入口）。
- 来源：本地文件（File System Access 文件句柄）+ 网页 PDF（URL）。
- 文本摘录 + 批注 + 标签 + 复用现有三种划线样式。
- 页内高亮还原。
- 阅读进度记忆。
- 标注只入库、不入档（不保存 PDF 本体）。
- 还原依据：本地 PDF 用文件指纹（大小 + 首尾采样）生成合成键，网页 PDF 用 URL。
- Dashboard 以"PDF 来源 + 页码"聚合展示，点击跳阅读器对应页。

### 不做（本阶段）
- 集合、自动发现聚合、backlinks、复习调度状态机、Inbox。
- 区域截图摘录（仅文本摘录）。
- 移动端/视频/图片 OCR 等其它采集面。
- 保存 PDF 文件本体。
- 改动现有网页采集行为。

## 已确认的关键决策
- 显式入口打开，不自动接管所有 `.pdf` 导航。
- 本地 PDF 用文件句柄打开，不启用 `file://` 直读权限。
- 标注同步；跨设备靠重新选择匹配文件（指纹）还原高亮。
- 本地 PDF 仅 Chrome 支持，Firefox 暂不支持（不投入）。
- 保留本地 PDF 路径，但加**测试后门**以规避原生 picker 无法自动化的问题；picker 本身手测。
- 本地 PDF 用合成 `url`（`myz-pdf:<hash>`）作为文档身份键，兼容现有 `url` 索引与分组。
- 阅读器记忆进度。
- Dashboard 点击 PDF 摘要 → 回阅读器对应页。

## 关键事实（已核实）
- Chrome 内置 PDF 阅读器是插件，内容脚本无法注入 → 必须自建阅读器。
- 现有 `MyZRecordSchemaV1` 为 `.passthrough()`，但仍按 schema-first 显式扩展字段。
- `url` 是必填字段，且 `groupRecordsByPage`、`getHighlightsForUrl`（IndexedDB `url` 索引）、查看器分组都以 `url` 为键（`dashboard/utils/records.ts`、`background/storage.ts`）→ 本地 PDF 必须有稳定的合成键，不能留空。
- `SyncRecordPayloadSchemaV1.data` 为 `z.unknown()`，新增 record 字段不影响 sync 协议（`packages/sync-core/src/schemas/v1.ts`）。
- PDF 的"页面结构"降级为页码，不适用网页的 heading 章节骨架。
- 本地 IndexedDB：`myz_db` v1，store `highlights`（`src/background/storage.ts`）。
- 扩展页 CSP 为 `script-src 'self'`；构建入口在 `vite.config.mjs` 的 `rollupOptions.input`。
- 仓库同时构建 Chrome 与 Firefox（`vite.config.mjs` 的 `TARGET`）。
- 现有验证命令：`npm run build`、`npm run test:dev`（vitest）、`npm run test:e2e`、`npm run lint`。

## 假设（低风险，先按此执行）
- 使用 npm 包 `pdfjs-dist`（版本在 INC-1 钉定）。
- 文件句柄与阅读进度存于独立 IndexedDB `myz_pdf_db`（v1，stores `handles`/`progress`），避免与 `myz_db` 版本耦合（实现时由原“升级 myz_db 到 v2”调整而来）。
- 网页 PDF 由阅读器页直接加载；扩展页有 `<all_urls>` host 权限可绕过 CORS，**无需 background 代取**（INC-1 已证实）。
- 本地 PDF 指纹用"文件大小 + 首尾采样字节"计算，不整份读入。
- 不改动 sync 协议版本，仅新增可选 record 字段（已核实 `data: z.unknown()`）。

## 边界与限制（计划需显式声明）
- **Firefox 暂不支持（已决策，不投入）**：本地 PDF 仅 Chrome。
- **扫描件/无文本层 PDF** 无法做文本摘录（属 OCR 方向，本阶段不做）。
- **加密 PDF**、**需登录/Cookie 的网页 PDF** 可能加载或抓取失败，属可接受限制。
- **跨页选区** 需要拆分或明确不支持（锚点模型以单页为单元）。
- pdf.js 升级可能导致文本锚点漂移，属可接受取舍。

## 风险（由 INC-1 尽早证伪）
- ~~pdf.js worker 在 MV3 `script-src 'self'` 下的加载方式~~（INC-1 通过：`?worker` + `workerPort`）。
- ~~CRXJS/Vite 对 pdf.js worker 与动态资源的打包处理~~（INC-1 通过：worker ~1.20 MB，需注意按需加载）。
- ~~网页 PDF 跨域抓取~~（INC-1 通过：扩展页 host 权限绕过 CORS，含无 CORS 头源）。
- 文件句柄跨会话的持久化与重新授权（仅人工可验）。
- 文本锚点在 pdf.js 重新渲染下的稳定性（含跨行多矩形、跨页选区）。
- content-script UI 与 DOM 逻辑的抽离成本（INC-4 前置）。
- 大 PDF 的内存与指纹采样成本（未压测）。
- Firefox 暂不支持（已决策，非风险）。

---

## 视觉验证约定（适用于 INC-3 ~ INC-6 等有 UI 的增量）
每个 UI 增量除逻辑断言外，必须产出**截图对比**作为验收证据：
- 用 Playwright 对稳定 fixture 截图，至少覆盖关键"之前/之后"状态（如：PDF 未选中 vs 已选中、无高亮 vs 有高亮、还原前后、Dashboard 聚合前后）。
- 可自动化的稳定画面用 `expect(locator).toHaveScreenshot()` 建立基线做视觉回归；含网络/字体等不稳定因素的画面，改为保存截图产物供人工核对，并在 findings/增量记录中说明。
- 截图产物入 `test-results/` 或指定目录，不污染默认 e2e（网络/截图类用例归入 `tests/spike` 或后续 `tests/pdf` 独立目录）。
- INC-1 已用此法定位并确认修复了文字选择的 `--total-scale-factor` 缺陷，作为模板。

## 增量

### INC-1 技术可行性 spike（pdf.js + MV3）
**状态**：已完成，结论 **GO**，见 `docs/research/pdf-spike.md`。
**产出**：临时验证页 `src/pdf/spike.html` + `src/pdf/spike.ts`；findings 文档 `docs/research/pdf-spike.md`。
**前置**：无。
**必须回答的问题**：
1. pdf.js ESM 能在 MV3 扩展页加载，worker 以 `new Worker(chrome.runtime.getURL(...), { type: "module" })` 正常运行。
2. `showOpenFilePicker` 在扩展页可用，`FileSystemFileHandle` 可持久化到 IndexedDB 并跨会话重新授权。
3. pdf.js text layer 可选择文本，能取到选区对应的页码、文本与几何矩形（含选区跨行/多矩形）。
4. 可在页面上叠加绝对定位高亮块，并在重新打开同一 PDF 后按存储锚点还原。
5. 网页 PDF 能通过**阅读器页直接 fetch** 加载（含跨域场景），**证伪"是否需要 background 代取"**。
6. 本地 PDF 的指纹方案（大小 + 首尾采样）足够区分文档，且不需要整份读入内存。
7. **测试后门**可行：提供一条 debug 消息/参数，绕过原生 picker 直接注入 PDF 字节，使阅读器渲染、锚点、还原逻辑可被自动化验证（即 Playwright 无法驱动 `showOpenFilePicker` 的规避方案）。
8. **平台边界**：Firefox 暂不支持（已决策，不做降级实现）。
**动作**：安装 `pdfjs-dist` 并钉版本；在 `vite.config.mjs` 增加 spike 入口；实现 spike 页覆盖上述 8 点；修正 worker/CSP/CORS 相关问题；实现测试后门。
**验证**：`npm run build` 通过；在 headed Chromium 加载 `dist` 扩展，逐条勾选并截图/记录；后门路径用 Playwright 自动化验证一次。
**完成标准**：8 条各给出"通过/受限/不通过"结论与证据；给出 go/no-go、锚点字段形态建议、本地 PDF 合成键建议、测试后门方案。

### INC-2 数据模型与锚点（schema-first）
**状态**：已完成。`sourceType`/`pdfLocator` 已入 schema，本地合成键 `myz-pdf:<hash>`，历史记录默认 `web`；共享单测 51 passed、myz 单测 108 passed、build 通过。
**产出**：`packages/shared` 中 `MyZRecord` 显式增加来源与定位字段：`sourceType`（web/pdf）、`pdfLocator`（`pageNumber`、`text`、`occurrenceIndex`、归一化 `rects`）；**本地 PDF 合成键 `url = myz-pdf:<hash>`**（网页 PDF 保持真实 URL），确保现有 `url` 索引与分组继续可用；`normalizeRecord`/序列化适配；单测。
**前置**：INC-1 锚点与指纹结论。
**动作**：更新 `schemas/records/v1.ts` 与类型；定义本地合成键与 `hostname`（如"本地文件"）；确保旧记录默认 `web` 不受影响；补充 round-trip 单测。
**验证**：`npm run test:dev` 新增用例通过；`npm run build` 通过。
**完成标准**：新字段可被 schema 接受并 round-trip，本地 PDF 可凭合成键被分组/检索/去重，历史数据无回归。

### INC-3 PDF 阅读器页与入口
**状态**：已完成。`src/pdf/` 阅读器页（Vue + pdf.js）、popup 入口、右键"在 MyZ 中打开 PDF"；**默认连续滚动**（懒渲染 + 滚动驱动当前页）；缩放控制；`tests/pdf/pdf-reader.spec.ts` 7 passed。
**产出**：`src/pdf/pdf-viewer.html` 阅读器页；入口（popup/action/右键"在 MyZ 中打开 PDF"）；支持 URL 与本地句柄；连续滚动、翻页跳转、缩放与进度记忆。
**前置**：INC-1、INC-2。
**动作**：新增构建入口与 manifest 配置；实现打开流程与句柄持久化；记录/恢复页码。
**验证**：网页 PDF 用 fixture 走 e2e（阅读器页直接加载）；本地 PDF 用 INC-1 测试后门自动验证渲染/翻页/进度，picker 本身手测；**截图对比**（加载后 / 翻页后 / 重开进度恢复）。
**完成标准**：两类 PDF 均可打开阅读，进度可恢复。
**实现要点（本轮补充）**：
- **连续滚动为默认**：所有页占位后按需渲染（IntersectionObserver），滚动位置驱动当前页并防抖保存进度；页间直接滚动衔接，单页不再需要"滚到底自动翻页"。
- **PDF 探测修正**：仅按 `.pdf` 后缀会漏掉 `https://arxiv.org/pdf/2606.19348` 这类无扩展名地址。入口改为 `extractPdfUrlFromBrowserUrl` 快路径 + `probeIsPdfUrl`（ranged GET 读 `content-type`/`content-disposition`）兜底，见 `src/pdf/detect.ts`，并有单测覆盖。**arxiv 在线用例已 `test.skip` 禁用（网络原因），无扩展名路径改由离线 fixture `reader_loads_extensionless_local_url` 覆盖。**
- **图片型 PDF 空白页修复（严重）**：pdf.js v6 需 WASM 解码 JPEG2000/JBIG2。此前 `wasmUrl`/`cMapUrl`/`standardFontDataUrl` 未配置且 MV3 CSP 禁止 WASM，导致 Wasserman《All of Statistics》第 2 页起全白（`JpxError: OpenJPEG failed to initialize`）。修复：构建把 `pdfjs-dist/{wasm,cmaps,standard_fonts,iccs}` 复制到 `dist/assets/pdfjs/`（`vite.config.mjs` 的 `copyPdfjsAssets`），运行时配置对应 URL，并在 manifest 的 `extension_pages` CSP 加入 `'wasm-unsafe-eval'`。
- **缩放**：工具栏 `− / 百分比 / +`，按档位（50%–300%）重建页面并保持当前页；舞台用 `align-items: safe center` 保证放大后可横向滚动。
- 布局：舞台为独立滚动容器（`height:100%` 链路），否则整页随窗口滚动导致懒渲染失效。
**截图证据**（`PDF_SHOT_DIR`）：
- `reader-web-page1.png` / `reader-web-page2.png`：2 页 fixture，工具栏 `1 / 2` → `2 / 2`，重开进度恢复到第 2 页。
- `reader-scroll-page5.png`：10 页 fixture，直接滚动到第 5 页，工具栏 `5 / 10`，重开后仍回到第 5 页；首屏仅渲染少量页（懒渲染）。
- `reader-zoom-in.png`：放大到 `200%`，页面按新比例重排。
- `reader-extensionless.png`：无扩展名 URL（`paper-2606.19348`）正常加载。
- `reader-local-page1.png`：本地字节（后门）加载，标题 `local-reader.pdf`。
- （空白页修复验证）`debug-wasserman-p2.png`：Wasserman PDF 第 2 页正常渲染。

### INC-4 PDF 摘录、批注与高亮还原（合并原 INC-4 / INC-5）
> 合并原因：摘录产出的锚点正是还原所需的数据，拆开会导致同一套 locator 逻辑做两遍。
**状态**：已完成。`tests/pdf/pdf-annotations.spec.ts` 2 passed（含保存→重开还原）。
**产出**：阅读器文本选区 → 浮动工具条（高亮 / 保存文字）+ 阅读器原生 Inspector（样式、颜色、批注、标签、删除）→ `myz:saveHighlight` 落库（携带 `pdfLocator` 与 content type）；重开同一 PDF（URL 或本地指纹）时按锚点自动还原高亮。
**实现说明（对本阶段“抽取 content Inspector”的调整）**：未强行抽取 content-script 的 Inspector（其依赖 `apply-highlight.ts`/`highlight-state.ts` 等 DOM 模块，成本高且易回归）。改为在阅读器内实现原生 Inspector，复用共享层：`HIGHLIGHT_STYLE_OPTIONS`/`DEFAULT_COLORS`/`CONTENT_TYPES`/`SOURCE_TYPES`、`normalizeRecord`、`sendMessage`，以及后台既有 `myz:saveHighlight`/`myz:updateHighlight`/`myz:removeHighlight`/`myz:getHighlightsForUrl`。网页采集侧组件零改动。
**动作**：选区 → PDF locator（页码 + 文本 + 出现序号 + 归一化 rects，见 `src/pdf/annotations.ts`）；overlay 渲染与恢复；`sourceType=pdf`/合成键；跨页选区**明确拒绝**（不生成错误锚点）。
**渲染与交互修正（评审后）**：
- **同线多矩形合并**：`mergeRects` 把同一行的重叠/相邻 rect 合并成一个，消除"多重高亮/双线"。
- **每记录单层透明组**：`opacity` 加在组上，避免叠加重叠区域二次变深。
- **下划线/波浪线改为文本层 `text-decoration`**：直接作用在文字 span 上，贴合字形；此前画在行框底部导致肉眼"错开"。overlay rect 退化为点击热区。
- **去掉选中态的紫色外框**：改为组透明度变化提示激活。
- **记忆上次高亮样式与颜色**：打开时读取 `myz:getSettings` 的 `lastUsedStyle`/`lastUsedColor` 作为新建默认值；保存/更新时由后台持久化。
- **Inspector 显式保存**：新增"保存"按钮与"已保存/未保存"状态；仍保留失焦自动保存。
**验证**：单测 + e2e（经测试后门）：保存后记录含 locator；保存→关闭→重开还原；多行选区只生成每行一个矩形且不重叠；对齐回归（overlay 与文字范围 dx/dy≈0）；波浪线为真实 `wavy` 装饰；记忆样式/颜色；保存按钮状态；**截图对比**。
**完成标准**：摘录（highlight/clip）可保存并携带标签/批注/样式；重开稳定还原；跨页选区明确拒绝；未破坏网页采集侧组件。
**截图证据**（`PDF_SHOT_DIR`）：
- `pdf-selection.png`：选中文本后出现浮动工具条。
- `pdf-annotated.png`：保存后页面叠加油墨高亮 + Inspector（样式/颜色/批注/标签/保存/删除）。
- `pdf-restored.png`：重开后下划线贴合文字还原。
- `pdf-wavy.png` / `pdf-underline.png`：波浪线为真实波形、下划线贴合字形（多行各一条）。
- `pdf-inspector-saved.png`：点击保存后状态显示"已保存"。

### INC-6 Dashboard 聚合展示与跳转
**状态**：已完成。`tests/pdf/pdf-dashboard.spec.ts` 1 passed（页面徽标 + 点击跳阅读器对应页）。
**产出**：PDF 记录在卡片/列表显示"第 N 页"徽标与"在阅读器中打开"动作（`src/pdf/open.ts`）；查看器同样显示页码与跳转按钮；跳转 URL 携带 `?url=`/`?fp=` + `&page=N`，阅读器新增 `page` 参数支持直接定位。
**前置**：INC-4。
**动作**：Dashboard 卡片/列表/查看器展示 PDF 页码；本地 PDF 隐藏无效外链，改为阅读器动作；阅读器支持 `page` 参数覆盖进度。
**验证**：e2e：保存 PDF 标注 → Dashboard 出现"第 1 页"徽标与打开按钮 → 点击打开新标签 `pdf-viewer.html?url=…&page=1` 且阅读器定位第 1 页。
**完成标准**：PDF 摘要完整进入现有查看链路并可回跳。
**截图证据**：`dashboard-pdf.png`：卡片显示"第 1 页"徽标与书籍图标动作。

### INC-7（可选）同步一致性
**状态**：已完成。
**产出**：确认 `sourceType`/`pdfLocator` 随 E2EE sync 往返不丢失；本地 PDF 在另一设备**无需已存句柄**，只要打开同一文件（指纹一致）即可还原标注。
**实现说明**：`SyncRecordPayloadSchemaV1.data` 为 `z.unknown()`，`serializeRecordPayload`/`deserializeRecordPayload` 走 `stableStringify` + deflate，`applyRecordPayload` 以 `{...record, updatedAt}` 原样落库 → 新字段无损。阅读器按合成键 `myz-pdf:<指纹>` 查询标注，指纹由文件内容（大小+首尾采样）决定，与句柄无关。
**验证**：单测 `tests/unit/background/sync/records.test.ts` 2 passed（web/pdf 记录往返）；e2e `pdf_local_annotation_restores_by_fingerprint`：设备 A 用文件字节创建标注 → 设备 B（无句柄）打开同一文件字节 → 指纹一致并还原标注。
**完成标准**：同步后他端可用同一文件还原标注。

---

## 执行顺序理由
INC-1 先证伪 P0 唯一"可能做不出来"的技术点；INC-2 遵循 schema-first；INC-3→6 按阅读→摘录→还原→展示的依赖链推进，每个增量都有独立可观察结果。

## 关联文档
- `docs/research/pdf-spike.md` — INC-1 技术验证结论（GO）。
- `docs/plan/future-plan.md` — 探索中已达成但暂缓的方向与结论。
