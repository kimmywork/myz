# EPUB 阅读与高亮

> 状态（2026-09-20）：E1–E5 已实现并合入。本地文件来源与打开、完整解析、重排阅读（目录/翻章/进度/主题跟随）、划定高亮/摘录（`range` + `epubLocator`，重开后按文本与锚点还原）、批注/标签/色板编辑、目录搜索与滚动联动、文库闭环。后续可做：网页 `.epub` URL、EPUB 采集浮条内联选色、`ReaderStage` 抽象。

## 背景与目标

阅读器目前只支持 PDF（原页 + 缩放 + 坐标标注）。设计系统 §1/§2 已把 EPUB 明确为另一条路：EPUB 天生可重排，没有固定页，所以高亮不能靠页面坐标，要靠文本锚点。

目标：在阅读器里打开本地 `.epub`，用重排排版阅读（复用 §4.16 的阅读设置），并在上面划线、摘录、写批注、加标签；重新打开或改变字号/窗口后，高亮仍能还原到原处。

## 范围

### 做
- 本地 `.epub` 文件的来源、指纹、持久化与打开管线（照搬本地 PDF 的文件句柄方案）。
- EPUB 解析：容器 → OPF → metadata / manifest / spine / 目录（nav/NCX）/ 封面。
- 重排阅读 UI：把 spine 的 XHTML 渲进同源 iframe，跟随方案与深浅色，复用阅读字号五档。
- 高亮/摘录/批注/标签：选区 → 采集条 → 复用 `@myz/shared/serializer` 的 range 序列化 + 文本回退；用 `epubLocator` 记录位置。
- 文库整合：EPUB 记录进库、查看器展示、从记录打开到对应位置。

### 不做
- 不做网页 `.epub` URL（本地闭环之后再评估）。
- 不改 PDF 的渲染/锚点逻辑。
- 不做 EPUB 的手写批注演进（只复用现有 note/tags）。
- 不引第三方 EPUB 渲染库。
- 不在本期做 EPUB 全文搜索、朗读、脚注弹层等。

## 已确认的关键决策

1. **来源先只做本地 `.epub`**：文件选择器 + 文件句柄 + 指纹 + IndexedDB，照搬 `src/pdf/source.ts` / `storage.ts`。
2. **自建渲染**：`fflate` 解压 + 同源 iframe 渲染 spine；不引 epub.js。
3. **高亮复用网页 range 序列化**：`serializeRange`（路径 + 文本回退 + anchor）与 `deserializeRange`，与网页高亮同一套记录字段 `range`。
4. **schema-first**：新增 `epubLocator` 与 EPUB 源 url 前缀，先改 shared schema/类型，再动存储与 UI。

## 关键事实（已核实）

1. **记录 schema**：`packages/shared/src/schemas/records/v1.ts` 已有可选 `pdfLocator`、`range`（`SerializedRangeSchema`）；`SOURCE_TYPES` 只有 `WEB`/`PDF`（`packages/shared/src/enums.ts`）。新增字段要同步 schema + `docs/knowledges/schemas/records/v1.md`。
2. **文本锚定已具备**：`packages/shared/src/serializer.ts` 提供 `serializeRange`、`serializeRangePaths`、`findRangeByNormalizedText`、`deserializeRange`；web 高亮的存/取已跑通，可直接用于同源 iframe 的 document。
3. **本地文件管线可照搬**：`myz-annotator/src/pdf/source.ts`（`showOpenFilePicker` + `queryPermission/requestPermission` + 指纹 + `putFileHandle`）与 `src/pdf/storage.ts`（IndexedDB `myz_pdf_db`：handles / progress）。
4. **阅读器入口是独立 Vite 入口**：`myz-annotator/src/pdf/pdf-viewer.html` + `main.tsx`，在 `vite.config.mjs` 的 `rollupOptions.input` 注册；PDF 测试靠 `window.__MYZ_PDF__` 后门。
5. **阅读排版已在 Token 层**：`--myz-read*`（字号五档、行距、栏宽）、`--myz-read` 字体；zen 已演示"不污染宿主页地把方案值内联"的做法（`src/content/zen.ts` + `theme-root.ts`）。
6. **文库打开 PDF 的入口**：`src/pdf/open.ts` 的 `buildPdfReaderUrl` / `openPdfRecordInReader`（本地用 `?fp=`，网页用 `?url=`）；EPUB 需要平行的 `buildEpubReaderUrl` / `openEpubRecordInReader`。
7. **依赖**：`fflate` 已在根依赖；未安装任何 EPUB/zip 之外的相关库。

## 假设

- 目标 EPUB 是标准 EPUB 2/3（`META-INF/container.xml` → OPF），非加密、无 DRM。
- EPUB 资源（CSS/图片/字体）可用 `blob:` URL 改写后在 iframe 内加载；扩展页 CSP 允许 `blob:`。
- 阅读器页面是扩展页，iframe 用 `srcdoc`/`blob` 渲染时与父页同源，可跨 iframe 访问 document 做选区与序列化。
- 破坏性变更可接受：新增可选字段，旧记录不受影响。

## 边界与限制

- **重排没有页码**：定位只能用 spine + 文本偏移/引用，不要假装有页码。
- **不同渲染的排版差异**：字号/窗口变化会改变锚点偏移，必须依赖文本回退而不是纯路径。
- **EPUB 的 CSS 可能影响宿主样式**：渲染在 iframe 里，与我们的阅读样式隔离；我们的排版写在 iframe 内注入的样式表，尽量用低特异性。
- **本地句柄权限**：新开标签页没有用户激活，重授权返回可恢复错误，照搬 PDF 的 `LocalPdfPermissionError` 流程。
- **不是所有 epub 都规整**：缺失 nav/NCX、无封面、路径大小写不一致等要能降级。

## 风险

1. **同源 iframe 选区与序列化**：父子文档边界、`Selection` 归属、序列化器期望的 Document 传参需要验证。缓释：E3 先用最小 fixture 打通一次选区→序列化→还原。
2. **资源改写**：相对路径、`url()`、`<base>`、字体/图片的 blob 映射容易漏。缓释：E2 单测覆盖路径解析；渲染时对所有 `src/href/url()` 统一重写。
3. **解析体积与性能**：整本解压 + 一次性解析可能卡顿。缓释：按 spine 懒渲染/懒解压；大图延迟。
4. **高亮与重排**：纯路径锚点在改字号后失配。缓释：始终以 `findRangeByNormalizedText` + anchor 回退，路径只作快路径。
5. **schema/url 变更影响旧数据**：缓释：新字段可选、默认不写；不改现有前缀语义。
6. **e2e 依赖**：新页面需稳定的 `window.__MYZ_EPUB__` 后门；fixture 用小型公开领域 epub 提交到 `tests/fixtures/`。

## 增量

### E1 来源与打开管线（schema-first）
**产出**：可解析 EPUB 源 url 与定位；能选择本地 `.epub`、算指纹、存句柄；生成阅读器 URL 并打开（页面暂只显示书名与解析状态）。
**前置**：无。
**动作**：
- shared：`MYZ_EPUB_SOURCE_URL_PREFIX`、`buildEpubSourceUrl`、`isEpubSourceUrl`、`epubFingerprintFromSourceUrl`；`SOURCE_TYPES` 增加 `EPUB`；`EpubLocatorSchema`（`spineIndex`、`progression`、`textQuote`/`textPrefix`/`textSuffix`）加入 `schemas/common.ts`，`MyZRecordSchemaV1` 增加可选 `epubLocator`；同步 `docs/knowledges/schemas/records/v1.md`。
- reader：`src/epub/{fingerprint,source,storage}.ts`（可复用 PDF 的哈希与 DB，但独立键位/库名避免混淆）；`src/epub/epub-viewer.html` + `main.tsx` 注册到 `vite.config.mjs`；`src/epub/open.ts` 的 `buildEpubReaderUrl` / `openEpubRecordInReader`。
- 入口：Dashboard/Popup 增加"打开本地 EPUB"（与"打开本地 PDF"并列）。
**验证**：shared 单测（url 往返、schema 解析/未知键、locator 默认）；annotator 单测（指纹稳定）；构建产物含 `epub-viewer.html`；`npm run build`。
**完成标准**：选本地 epub → 生成 `myz-epub:` 源与 reader URL → 打开页面并显示书名。

### E2 EPUB 解析
**产出**：把 `.epub` 字节解析成模型：metadata（title/author/language）、manifest、spine、目录、封面；资源以 blob 映射。
**前置**：E1。
**动作**：`fflate` 解压；解析 `META-INF/container.xml` → OPF；解析 OPF 的 metadata/manifest/spine；解析 EPUB3 nav 与 EPUB2 NCX 目录（缺失时降级为空）；封面探测；相对路径解析与资源 blob 注册；XHTML 清洗（去脚本，保留语义标签）。
**验证**：单测用 fixture epub 断言 spine 数量、标题、目录层数、资源映射关键项；异常 epub（无 nav、单章）降级不抛。
**完成标准**：模型稳定，后续渲染只依赖模型。

### E3 重排阅读 UI
**产出**：阅读页渲染当前 spine 文档，目录侧栏、上一章/下一章、进度；排版跟随方案/深浅色与阅读字号五档。
**前置**：E2、§4.16 Token（已存在）。
**动作**：同源 iframe 渲染 spine XHTML + 注入阅读样式（`--myz-read-*`）；资源用 blob URL；目录复用 PDF 侧栏形态（§4.22，两分页签：目录/标注，标注页 E4 才有内容）；章节切换与进度持久化（复用 `storage` 的 progress 形态）；`window.__MYZ_EPUB__` 后门。
**验证**：e2e 打开 fixture → 断言正文渲染、目录项数量与跳转、改字号/窗口后不报错；浅色/深色 × 四方案截图。
**完成标准**：能连续阅读、可跳章、排版随设置。

### E4 高亮 / 摘录 / 批注
**产出**：在 EPUB 上选区 → 采集条（划线/摘录）→ 记录入库；重新打开或改字号后高亮还原；Inspector 可就地编辑批注/标签。
**前置**：E3、serializer（已存在）。
**动作**：选区落在 iframe document；采集条复用 §4.7；`serializeRange` 存 `range`，`epubLocator` 存 `{spineIndex, progression, textQuote}`；渲染时 `deserializeRange` + `findRangeByNormalizedText` 还原；`HighlightStyle` 三样式复用；Inspector/TagInput/调色盘复用 §4.18/§4.14；记录 `sourceType=EPUB`、`sourceUrl=myz-epub:<fp>`。
**验证**：e2e 建高亮 → 刷新 → 还原；字号从 18 改到 22 后仍还原；批注/标签往返；截图。
**完成标准**：EPUB 高亮与网页高亮同一体验、同一存储。

### E5 文库整合与规范/文档
**产出**：EPUB 记录在 Dashboard/查看器正确展示与打开；设计系统与文档更新。
**前置**：E4。
**动作**：`records.ts` / `HighlightViewerPage` 识别 EPUB 来源与 `epubLocator`（显示书名/章节，替代页码徽标）；`openEpubRecordInReader` 接入卡片/查看器动作；`design-system.md` §6 的 EPUB 场景从"未做"更新为已支持；`docs/plan` 与 AGENTS 关系；worklog。
**验证**：dashboard e2e（EPUB 记录渲染与打开）、查看器 e2e；`npm run build` + `test:playwright` + `tests/pdf` 不回归。
**完成标准**：从库到原文的闭环可用。

## 执行顺序理由

E1 先解决"源与打开"，且把 schema/url 定死，后面不再返工。E2 把解析与 UI 解耦，便于单测。E3 在没有任何高亮的情况下先打通重排与 iframe（最大未知项：同源选区），再进 E4 做高亮。E5 收尾整合，避免早期就改文库。

## 关联文档

- `docs/research/design-system/design-system.md` — §1/§2 路线、§4.16 阅读设置、§4.22 阅读器组件、§6 EPUB 场景。
- `docs/plan/pdf-support.md` — PDF 阅读器实现与视觉验证约定。
- `packages/shared/src/serializer.ts` — range 序列化/还原。
- `myz-annotator/src/pdf/{source,storage,open}.ts` — 本地文件与打开管线样板。
