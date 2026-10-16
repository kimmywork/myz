# 截图拼接与图片合成集成（Stitch Integration）

状态：已与用户确认关键决策，开始实施
日期：2026-10-13
关联：`../stitch-web`（React + Vite 静态工具，本次移植来源）

## 1. 目标

把 `../stitch-web` 的图片拼接/合成能力集成进 `myz-annotator`，并增强捕获：

1. **增强捕获**
   - 网页图片：右键直接导入（缓存区 + 下载 + 尽力复制到系统剪贴板）。
   - 视频：右键截取当前播放帧（画面本体，不含进度条/控件）。
   - 现有「选区截图 / 聚焦阅读整篇截图」除下载外，再留一份到插件缓存区。
2. **图片缓存区（staging）**：浏览、多选、删除，选择后进入拼接/合成界面。
3. **拼接/合成编辑器**：移植 stitch-web 三个模式——截图拼接（长图/字幕堆叠/无缝裁剪/过渡混合）、拼图（1–16 网格）、展示图（App Store/Google Play 尺寸）。配色改为插件 `--myz-*` 令牌，支持浅/深色与配色方案。
4. **文档**：本计划 + 一份「跨技术栈移植经验」文档（`docs/knowledges/`），供后续类似移植参考。

## 2. 关键决策（已确认）

| 决策 | 结论 |
| --- | --- |
| 编辑器位置 | **独立全屏扩展页面** `src/stitch/stitch.html`（新标签页，同 PDF/EPUB 阅读器） |
| 移植范围 | **全部三个模式**：截图拼接 + 拼图 + 展示图 |
| 图片存储/同步 | **仅本地 IndexedDB，不纳入 E2EE 同步**（图片体积大，现有同步为小文本按条加密） |
| 网页图片「复制」语义 | **存入缓存区 + 下载 +（尽力）系统剪贴板** |

## 3. 现状要点

- 捕获（`src/content/`）：选区截图 `toolbar-store.handleScreenshotClick()` → `cropAndDownloadSelection()`；聚焦阅读整篇 `captureZenTargetFull()`。均只下载。
- 背景 `myz:captureSelection` 包装 `chrome.tabs.captureVisibleTab`。
- 记录存于 IndexedDB `myz_db`（`highlights`/`inbox_state`）；同步仅传 `h:` 高亮记录。
- 内容脚本与宿主页同源，其 IndexedDB 属宿主页 origin，**不可**用于插件缓存；二进制须经背景 `myz_db` 落库。
- 扩展页面（dashboard/PDF/EPUB/新 stitch）与 service worker 同属扩展 origin，共享 `myz_db`。
- stitch-web：核心 `src/core/**`（gray/matching/stitch/layouts/showcase/export）框架无关，可近原样移植；`App.tsx`/`useAssets`/`modes`/`components` 为 React，需改写为 Vue 3 JSX + Pinia。

## 4. 总体架构

```
捕获层（content script）
  ├─ 选区截图 / 聚焦阅读整篇（已有，增加 staging）
  ├─ 网页图片右键 → capturePageImage（canvas / fetch / captureVisibleTab 兜底）
  └─ 视频右键 → captureVideoFrame（canvas 帧 / captureVisibleTab 裁剪兜底）
        │  dataUrl + thumb + 元数据
        ▼
背景（service worker）
  ├─ myz:stageAsset → myz_db / staged_assets
  ├─ myz:listStagedAssets / myz:getStagedAsset / myz:deleteStagedAsset / myz:clearStagedAssets
  └─ 右键菜单：myz-save-image（contexts:image）/ myz-capture-video-frame（contexts:video）
        │
        ▼
编辑器页（src/stitch/stitch.html，扩展页面）
  ├─ 缓存区选择器（缩略图多选）→ 进入编辑器
  ├─ 三模式编辑器（Vue JSX + Pinia）
  ├─ core/**（移植的框架无关算法）
  └─ 导出：下载 / 复制（复用 ExportPanel 逻辑）
```

## 5. 增量计划

### INC-1 暂存仓库基础
- **产出**：`staged_assets` 对象存储（`myz_db` 版本 2→3）+ 类型 + 背景 CRUD + 消息 API。
- **动作**：
  - 新增 `src/stitch/staged-asset.ts`：`StagedAsset`/`StagedAssetMeta`/`normalizeStagedAsset`/`makeThumbSpec`。
  - `src/background/storage.ts`：`DB_VERSION=3`，`upgradeSchema` 建 `staged_assets`（keyPath `id`，索引 `createdAt`）+ CRUD。
  - `src/background/messages/staged-assets.ts`：`myz:stageAsset` / `myz:listStagedAssets` / `myz:getStagedAsset` / `myz:deleteStagedAsset` / `myz:clearStagedAssets`。
  - `background.ts` 注册。
- **验证**：`vue-tsc -b`、eslint、`npm run build` 通过；`normalizeStagedAsset` 单测。

### INC-2 捕获增强
- **产出**：右键导入网页图片、右键截取视频当前帧、选区/整篇截图入库。
- **动作**：
  - `src/content/capture-media.ts`：`capturePageImage(srcUrl)`、`captureVideoFrame(srcUrl?)`，含 canvas/简介/兜底三级、缩略图、入库、下载、剪贴板。
  - `src/content/messages/capture.ts`：注册两个内容侧消息；`message-listener.ts` 接线。
  - `background.ts`：新增右键菜单项与点击处理。
  - `toolbar-store.ts` / `zen.ts`：截图后 `stageAsset`。
- **验证**：build + typecheck；e2e 或在真实 Chrome 手测（右键图片/视频 → 缓存区出现条目）。

### INC-3 stitch 核心移植
- **产出**：`src/stitch/core/**` 框架无关算法（gray/matching/stitch/layouts/showcase/export + types）。
- **动作**：迁移并去除 React 依赖；统一相对导入；保留公共 API。
- **验证**：`vue-tsc` + 对 `estimateOffset` / `buildGeometry` / `getLayouts` 的纯逻辑单测。

### INC-4 编辑器 UI（Vue JSX）+ 配色
- **产出**：`src/stitch/` 页面（App、三模式、组件、Pinia store、样式）、`stitch.html`、vite 入口、缓存区选择器。
- **动作**：
  - `stores/assets.ts`：从 `useAssets` 改写。
  - `components/`：UI 原语、PreviewCanvas、AssetTray、DropZone、ExportPanel、StagingPicker。
  - `modes/`：ScreenshotMode/CollageMode/ShowcaseMode。
  - `stitch-viewer.css`：`--c-*` → `--myz-*` 别名 + 移植样式。
  - `main.tsx`：挂载 + theme/colorScheme。
- **验证**：build + typecheck；打开页面手测三模式。

### INC-5 入口与文档
- **产出**：popup/导航入口打开编辑器；经验文档；worklog/AGENTS 更新。
- **动作**：popup 增按钮；dashboard 文库页或导航入口；`docs/knowledges/stitch-web-port.md`；`.agents/worklog`。
- **验证**：build + 手测入口可达。

## 6. 存储与同步结论

- 缓存图片**仅本地**（IndexedDB `myz_db/staged_assets`），不进同步。
- 理由：现有 v2 同步按记录（小文本）加密分片，图片为二进制大对象，纳入需新协议与配额，成本高、收益低。
- 数据保留：编辑器导出/下载是用户留存的出口；缓存区提供清空与单条删除。
- 未来如需跨设备：可另立「二进制子流」或走用户自备 S3，作为独立计划，不在本次范围。

## 7. 风险

- 跨域图片/视频帧受 CORS/画布污染限制 → `captureVisibleTab` 裁剪兜底（可见分辨率）。
- 内容脚本消息载荷为 JSON，dataUrl 体积较大 → 缩略图 + 按需取全图，控制列表体积。
- React→Vue 改写产生行为差异 → 逐模式对照，保留 pure core 不变以降低风险。
- 画布上限（浏览器 canvas 最大边长/面积）→ 复用 stitch-web 的降级逻辑。

## 8. 实施状态（2026-10-14）

INC-1..INC-5 已落地：

- **INC-1** `myz_db` v3 + `staged_assets` + `src/stitch/staged-asset.ts` + 背景消息 CRUD（特权白名单）✅
- **INC-2** `src/content/capture-media.ts`（图片三级兜底 / 视频取帧）、内容消息、右键菜单、选区与整篇截图入库、背景 `myz:fetchAsset` ✅
- **INC-3** `src/stitch/core/**` 移植（`stitch.ts` 拆 `stitch-geometry.ts` 过尺寸护栏），纯逻辑单测 17 ✅
- **INC-4** `src/stitch/` 编辑器页（Vue JSX + Pinia + 令牌化 CSS）、缓存区选择器、`vite.config.mjs` 入口 ✅
- **INC-5** popup「图片合成」按钮、右键「打开 MyZ 拼图」、`docs/knowledges/stitch-web-port.md`、AGENTS/worklog ✅

验证：`tests/unit/stitch` 17 通过；`vue-tsc -b` 0 错；`eslint src/stitch` 0 error；`vite build` green（`stitch-viewer` ~62.5 kB）。

遗留（后续增量）：

- 模式组件偏大（`ScreenshotMode` ~760、`CollageMode` ~521 行）超出 400 行告警：计划把侧栏面板拆子组件、纯逻辑抽 composable。
- 真实浏览器端到端手测未自动化（右键图片/视频 → 缓存区 → 拼接 → 导出）。
- 缓存区配额/清理策略（当前仅手动删除/清空），以及缩略图与全图均以 data URL 存储的体量评估。
