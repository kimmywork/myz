# MyZ Annotator

中文名：MyZ 高亮助理

[Chrome 安装](https://chromewebstore.google.com/detail/mhakfcbobhdemicjelhjjpmgibhnnplg)
[Edge 安装](https://microsoftedge.microsoft.com/addons/detail/fepakkoggnancnpcclldodfbpgobkabj)

**MyZ 高亮助理** 是一款 Chrome 扩展，帮助你在任意网页、PDF 与 EPUB 中高亮文本、撰写批注、截图收集，并在本地管理这些资料。它支持导出 JSON / Markdown、端上翻译与自带 S3 的端到端加密同步。

> 说明：加密同步使用你自己的 S3 兼容对象存储；同步密钥由你输入的密码派生，我们不保存你的密码，遗忘后需重新全量加密并同步。扩展不提供任何远程服务；所有数据默认仅保存在本地浏览器中。

## 主要特性

- ✍️ **即时高亮**：选中文本自动出现浮动工具条，可一键添加批注或使用 📸 按钮截取选区图片。
- 🖊️ **多样标注样式**：支持高亮、下划线、波浪线三种样式，切换器使用全新 SVG 图标（马克笔、带下划线的字母 U、波浪线）清晰区分，并记忆最近使用的颜色与样式，在 Markdown 导出时带出描述。
- 🌙 **暗色友好调色板**：重制 5 色调色板，确保在暗色模式下仍保持足够的对比度，同时保留自定义与最近使用记忆。
- 📝 **快速保存文本**：浮动工具条新增 📝 按钮可将选中文字存入收集箱而不在页面上呈现标注，Popup 与 Dashboard 会使用独立的样式区分保存项并提供一键降级 / 升级。
- 🎨 **可定制调色板**：提供 5 色调色板并记忆最近使用的颜色，支持快速编辑颜色值。
- 🔔 **操作栏角标**：扩展图标会实时显示当前页面的标注数量，方便浏览时掌握进度。
- 🛡️ **稳健的高亮回放**：记录持久化在 IndexedDB（`myz_db`），设置、主题与旧数据迁移入口使用 `chrome.storage.local`；重新访问同一页面时自动恢复，并且在 DOM 变化时自动轮询重试；若仍无法定位，会通过页面内 toast 与 Popup 异常提示提醒处理。
- 🚫 **重叠保护**：新建标注时若所选范围与已有标注重叠会即时提示并拒绝创建，避免相互嵌套导致定位错乱。
- 🔁 **SPA 感知恢复**：监听 History API 与 URL 变更自动触发 `scheduleRestoreIfUrlChanged`，在单页应用内导航后即时重刷高亮与角标；Twitter 这类客户端内跳转现在无论点击推文还是前进/后退都能立即恢复。
- 📑 **富文本保真**：采集时保留链接、列表、引用、代码块等基础结构，展示与导出时按需转换为 Markdown。
- 🧰 **管理中心**：Dashboard 支持卡片 / 列表视图（记忆上次选择）、标签多选、全文搜索、日期范围与网站筛选，并采用懒加载保障性能；高亮查看器支持同页标注连续阅读、滚动到底自动切换；同时提供文件导入（MyZ JSON、RainDrop CSV、Weava CSV、Chrome 书签 HTML），支持「跳过 / 覆盖 / 保留最新」三种冲突策略并显示导入摘要。
- 🗂️ **侧边详情面板**：点击任意高亮即可在页面右侧打开固定位置的详情面板，支持复制 Markdown、编辑、删除。
- 🔐 **端到端加密同步（E2EE）**：使用你自己的 S3 兼容对象存储，同步密钥由密码派生且仅保存在本地；遗忘密码需重新全量加密并同步。
- ℤ **统一图标集**：扩展图标与操作栏图标统一为带有「ℤ」符号的视觉语言，浮动工具条、Popup、Dashboard 按钮全面改用自研 SVG 图标，跨浏览器保持一致并提供亮/暗色双版本资源。
- 🧘 **禅定模式（Zen Mode）**：在包含文章主体的页面一键进入沉浸式阅读，仅保留文章区域并优化打印样式；不改变 DOM 结构，确保高亮路径与恢复不受影响。支持右键菜单一键切换，并在启用后显示「保存文章为图片」的上下文菜单以便导出。
- 📄 **PDF 阅读与标注**：内置 PDF 阅读器（显式打开本地文件或网页 PDF），默认连续滚动与缩放，支持选中文本高亮/保存、批注与标签；重开同一 PDF 自动还原高亮，并支持 JPEG2000/JBIG2 图片型文档。Dashboard 显示页码并可一键跳回阅读器对应页。
- 📚 **EPUB 阅读与标注**：内置重排 EPUB 阅读器，解析 EPUB3 nav / EPUB2 NCX 目录，支持章节跳转、阅读进度记忆与跟随主题；重开同一本书按「章节锚点 + 文本引用」还原高亮。
- 🌐 **端上翻译与对照翻译**：基于 Chrome 内置 Translator / Language Detector API，PDF / EPUB / 网页采集条均可翻译；首次使用需联网下载模型与语言包，下载完成后可离线使用；阅读器可切换「对照翻译」并排双栏，语言包与译文带本地缓存。
- 🧩 **图片拼接与合成**：独立「MyZ 拼图」页支持截图拼接（无缝/混合/字幕堆叠/串联）、拼图（1–16 张网格与特色布局）与展示图（应用商店/社交尺寸），可从本地图片缓存区按选择顺序导入。
- 📥 **Inbox 处理队列**：新采集进入 `pending`，可标记、稍后、保留入文库、归档或删除；支持队列页 / 专注分流、标签拖拽与批量操作。
- 🖼️ **媒体采集与缓存区**：选区截图、网页图片、视频帧与「保存文章为图片」可下载并留一份到本地图片缓存区（`staged_assets`，仅本地、不参与加密同步）。
- 🤖 **外部 AI 解读（默认关闭）**：在设置中启用后，采集条的「解读」会把选区（含图片时附带截图）交给 DeepSeek / Qwen 的网页会话，并在 Chrome 155+ 用 Split View 把聊天页与原文并排；只填充输入框，不自动发送。

## 快速开始（开发者）

项目的前端 UI 使用 Vue 3 + TSX（Composition API），通过 `@crxjs/vite-plugin` 在 Vite 中构建符合 MV3 的扩展包。核心业务逻辑（background / content / readers / shared helpers）位于 `myz-annotator/src`。

基本开发步骤：

1. 安装依赖（仓库根目录，npm workspaces 会一次装齐扩展与 `packages/*`）：

   ```bash
   npm ci
   ```

2. 本地开发（在 `myz-annotator/` 下）：

   - 运行开发服务器（启动 Vite）

     ```bash
     npm run dev
     ```

     这会启动 Vite（含 Vue + TSX 支持）。注意：Service Worker（background）不能像普通页面那样实现完整的 HMR；当修改背景脚本或 content script 时，仍需在 `chrome://extensions/` 中手动重新加载扩展或重启 Service Worker。

3. 生成发布构建：

   ```bash
   npm run build
   ```

   构建输出位于 `dist/`（或由 `vite`/`@crxjs/vite-plugin` 指定的输出目录），将该目录作为已解压扩展加载到 Chrome（或压缩上传到 Chrome Web Store）。

4. 在 `chrome://extensions/` 中启用「开发者模式」，点击「加载已解压的扩展程序」，选择构建输出目录（`dist/` 或相应产物）。

### 自动化测试

测试分两层：

- **单元测试（Vitest）**：位于 `myz-annotator/tests/unit/`，使用 jsdom，覆盖 `@myz/shared`、`@myz/core`、`@myz/sync-core` 的纯逻辑，以及 store / composable。
- **端到端（Playwright）**：位于 `myz-annotator/tests/extension`、`tests/pdf`、`tests/spike`、`tests/transport`，以 unpacked extension 加载构建产物。

```bash
# 单元测试（不需要先构建）
npm run test:dev

# 端到端：先构建，再运行 Playwright
npm run build
npm run test:playwright
```

覆盖范围包括浮动工具条与高亮持久化、重叠保护、Popup / Dashboard 交互、复杂页面导出、截图下载、PDF / EPUB 阅读器、同步向导与 S3 传输层。

CI（`.github/workflows/extension-ci.yml`）会跑版本一致性、单测、ESLint、jscpd、设计令牌检查，以及构建 + Playwright。

调试建议：

- Playwright 默认以 headless Chromium 运行；本地想看到界面时使用 `HEADED=1 npm run test:playwright`。Linux CI 通过 `xvfb-run` 提供虚拟显示。
- 测试会启动带临时用户数据目录的 Chromium 并加载 `dist/` 扩展。
- 失败时用 `npx playwright show-report` 查看 HTML 报告与 trace（CI 已上传 artifact）。

新增功能时，优先给纯逻辑补 Vitest 用例；涉及 content script / 工具条 / modal / reader 的交互再补 Playwright。历史上的「保存文字」回归（toolbar 未写入 `state.currentText`）已有对应 e2e 覆盖。

### 常用操作

- **新建高亮**：选中文本 → 点击浮动 ✍️ → 选择想要的颜色 / 样式 → 填写批注 / 标签 → 保存；若与现有高亮重叠会提示冲突并取消创建。
- **保存文本**：选中文本 → 点击 📝 → 直接保存为纯文本记录，可在 Popup / Dashboard 中继续编辑或转换为标注。
- **截图选区**：选中文本 → 点击 📸 → 自动去除系统选区高亮后保存 PNG，并留一份到本地图片缓存区。
- **阅读 PDF / EPUB**：Popup 或 Dashboard 打开本地文件 / 网页 PDF / EPUB，选中文本即可高亮或保存；进度与高亮按文件指纹还原。
- **对照翻译**：在阅读器工具栏开启「对照翻译」，选择目标语言后，可视区域内的段落会增量翻译到并排右栏。
- **Inbox**：Dashboard 的 Inbox 页处理新采集：标记、稍后、保留入文库、归档或删除。
- **图片合成**：Popup 的「图片合成」或右键「打开 MyZ 拼图」，从图片缓存区按选择顺序导入。
- **查看 / 编辑**：点击高亮或在 Popup、Dashboard 中查看详情，支持 Markdown 复制与快速定位。
- **导出 / 导入**：Dashboard 可生成 JSON 与 Markdown；设置页提供文件导入入口（MyZ JSON / RainDrop CSV / Weava CSV / Chrome 书签 HTML），可选择冲突策略并查看导入统计。
- **外部 AI 解读**：设置 → AI 中开启并选择 DeepSeek / Qwen；选中文本后点采集条「解读」，扩展会打开对应聊天页并填入提示词与截图（不会自动发送）。该功能默认关闭，因为会把选区内容发送给第三方。

## 数据结构（节选）

记录存放在 IndexedDB `myz_db` 的 `highlights` store（主键 `id`，索引 `url` / `createdAt`），每条记录形如：

```json
{
  "schemaVersion": "1.0.0",
  "id": "myz_123",
  "kind": "highlight",
  "sourceType": "web",
  "url": "https://example.com/path",
  "sourceUrl": "https://example.com/path#section",
  "hostname": "example.com",
  "title": "页面标题",
  "text": "选中文本的纯文本版本",
  "html": "<pre><code>const n = 1;</code></pre>",
  "note": "批注内容，支持多行",
  "tags": ["research", "todo"],
  "color": "#fde68a",
  "style": "paint",
  "range": {
    "start": { "path": ["..."], "offset": 0 },
    "end": { "path": ["..."], "offset": 12 }
  },
  "createdAt": "2025-10-24T08:00:00.000Z",
  "updatedAt": "2025-10-24T08:05:00.000Z"
}
```

- `schemaVersion` 由 `@myz/shared/versioning` 管理；旧记录通过 `normalizeRecord` 归一化。
- PDF / EPUB 记录分别带 `pdfLocator` / `epubLocator`，网页记录带 `range`。
- `kind` 区分高亮、保存文本、书签等；`sourceType` 区分 web / pdf / epub。

### DOM 路径序列化

- `serializeRange` 会在生成 `path` 时跳过 `.myz-highlight` 包裹节点，并记录原生 DOM 节点类型 + 文本偏移；渲染时 `deserializeRange` 会在必要时临时拆除 MyZ 包裹节点，再按原始节点结构重新定位。
- `resolvePath` 和 `isNodeFromMyz` 会验证路径与当前 DOM 的一致性；若缺失节点或文本变更，则触发 `markHighlightForReapply` 并在 UI 中提示用户。
- 高亮应用完成后会重新挂载浮动工具条并调用 `updateHighlightIndicators()`，确保角标数量与页面状态同步。

## 发布到 Chrome Web Store

1. **准备素材**：
   - `manifest.json`（MV3）已就绪，确认 `version`、`description`、`host_permissions` 等符合政策。
   - `action` 图标、128×128 应用图标、以及 CWS 要求的 16 / 48 / 128 尺寸资源需准备放入 `myz-annotator/assets/`（或自定义目录）。
   - 产品截图（最少 1 张，建议多尺寸）与 1024×500 宣传横幅。
2. **隐私与政策**：
   - 起草隐私政策说明数据仅存储于本地，不与远端共享；在 CWS 提交时提供可访问的链接。
   - 检查扩展权限与 `host_permissions` 是否符合政策（例如 `storage`、`tabs`、`activeTab`、`search`、`contextMenus`、`<all_urls>` 等），并在隐私政策中说明可选的加密同步会连接用户自行配置的第三方对象存储。
3. **打包上传**：
   - 在 `myz-annotator/` 内运行 `npm run build`，产物位于 `myz-annotator/dist/`，并会生成打包文件 `myz-annotator/release/crx-myz-annotator-<version>-chrome.zip`（Firefox 目标为 `-firefox.zip`）。
   - 登录 CWS Dashboard，创建条目并上传 `crx-myz-annotator-<version>-chrome.zip`。
4. **填写商店信息**：
   - 产品名称、简介、详细介绍（可参考本 README）。
   - 声明该扩展在本地存储数据；可选的加密同步功能会请求用户自行配置的第三方对象存储，并提示用户注意隐私与费用风险。
5. **发布前检查**：
   - 通过 Chrome Beta / Stable 实机 smoke test。
   - 确认 Popup、Dashboard 与高亮/截图/同步等常用场景均可使用。
   - 检查 `manifest_version`, `service_worker` 中未使用 DOM API（已全部替换）。

## 架构与本地开发提示

- UI 使用 **Vue 3 + TSX**（Composition API）与 Pinia。页面入口：`myz-annotator/src/popup/`、`src/dashboard/`、`src/pdf/`、`src/epub/`、`src/stitch/`。
- Content script 在 `src/content/`，background 在 `src/background/`，跨 PDF / EPUB 的阅读器 chrome 在 `src/reader/`。
- 共享逻辑按环境分层：
  - `packages/shared/`（`@myz/shared`）：环境无关原语，以及浏览器专用的 `messaging` / `idb` / `theme` 等子路径。
  - `packages/core/`（`@myz/core`）：领域模型与纯读模型，含存储 / 传输端口。
  - `packages/sync-core/`（`@myz/sync-core`）：E2EE 加密、协议与 S3 传输。
  - `packages/dashboard-ui/`：可复用的 dashboard 展示组件。
- 存储：记录走 IndexedDB `myz_db`（`@myz/shared/idb`，含连接缓存与 schema 升级）；设置、主题与旧数据迁移入口走 `chrome.storage.local`。新增设置项先改 schema / 类型，再改 UI 与存储。
- 背景脚本运行在 MV3 Service Worker 环境：不要使用 DOM API，消息 payload 必须可序列化，异步错误要显式处理。
- 修改 background / content script 后，在 `chrome://extensions/` 手动重载扩展或重启 Service Worker；Popup / Dashboard / reader 页面可走 Vite HMR。
- 代码尺寸门禁：单行 ≤120 字符，文件目标 ≤300 行（`max-lines` 当前在 400 行告警）；新增代码优先拆分而不是放大模块。

更多实现细节见仓库 `docs/`（`knowledges/` 为实现参考，`plan/implemented/` 为已落地计划，`reviews/` 为质量评审），以及各目录的 `AGENTS.md`。

## 支持

遇到问题或希望新增功能，欢迎在仓库提 Issue 说明场景与复现步骤。

## 禅定模式（Zen Mode）

- 使用方式：
  - 在包含文章主体的页面，右键打开浏览器上下文菜单，选择「禅定模式 (仅显示文章)」。
  - 进入后菜单项会变为「退出禅定模式」，再次点击即可恢复。
  - 进入禅定模式后，会额外出现「保存文章为图片」菜单项，仅截取文章主体而非整页。

- 兼容范围：
  - 默认会尝试以下选择器定位文章主体：`article`、`#article`、`#article-content`、`.article`、`.article-content`、`[role="article"]`。
  - 支持按 URL 自定义规则，优先匹配开发者维护的映射，其次才是默认选择器。
  - 已内置 gcores 文章页规则（例如 `https://www.gcores.com/articles/206815`），使用 `.articlePage` 作为选择器。

- 可定制映射：
  - 编辑 `myz-annotator/src/content/zen-config.ts`，按需追加规则（从上到下，第一个命中生效）：

    ```js
    export const ZEN_SELECTOR_MAP = [
      // gcores 文章页
      { pattern: /:\/\/(?:www\.)?gcores\.com\/articles\/\d+/, selector: ".articlePage" },
      // 示例：example.com 使用自定义容器
      { pattern: /example\.com/, selector: "main .article" },
    ];
    ```

- 实现要点（不破坏高亮）：
  - 禅定模式仅通过给目标元素与其祖先节点添加类名，并注入一段 CSS 来隐藏其它元素；不会移动或重排节点。
  - 这样可保持高亮所依赖的 DOM 路径与文本偏移不变，标注的恢复与定位规则无需变更。
  - 打印样式（`@media print`）同样只输出文章主体，便于直接打印干净稿件。
  - 与背景页的交互通过消息路由完成：`"myz:toggleZenMode"`、`"myz:canEnterZenMode"`、`"myz:getZenModeState"`；内容脚本在状态变更后发送 `"myz:zenModeStateChanged"` 用于刷新菜单标题与可见性。

- 常见问题：
  - 若右键菜单未出现，说明当前页面未检测到可识别的文章主体。可在 `zen-config.ts` 中添加匹配规则后重载扩展。
  - 某些站点在 SPA 导航后需要等待内容渲染完成，菜单会在页面完成加载时自动刷新显示/隐藏与标题。
  - 如遇文章主体选择器与站点样式冲突，可在 `ZEN_SELECTOR_MAP` 中为特定域名添加更精确的选择器，或临时禁用该页的样式隔离进行验证。