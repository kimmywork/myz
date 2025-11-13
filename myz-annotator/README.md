# MyZ Annotator

[Chrome 安装](https://chromewebstore.google.com/detail/myz-annotator/mhakfcbobhdemicjelhjjpmgibhnnplg)
[Edge 安装](https://microsoftedge.microsoft.com/addons/detail/myz-annotator/fepakkoggnancnpcclldodfbpgobkabj)

MyZ Annotator 是一款 Chrome 扩展，帮助你在任意网页高亮文本、撰写批注、截图收集，并在本地管理这些资料。它支持导出 JSON / Markdown，以及与本地 LogSeq graph 进行安全的增量同步。

## 主要特性

- ✍️ **即时高亮**：选中文本自动出现浮动工具条，可一键添加批注或使用 📸 按钮截取选区图片。
- 🖊️ **多样标注样式**：支持高亮、下划线、波浪线三种样式，切换器使用全新 SVG 图标（马克笔、带下划线的字母 U、波浪线）清晰区分，并记忆最近使用的颜色与样式，在 LogSeq / Markdown 导出时带出描述。
- 🌙 **暗色友好调色板**：重制 5 色调色板，确保在暗色模式下仍保持足够的对比度，同时保留自定义与最近使用记忆。
- 📝 **快速保存文本**：浮动工具条新增 📝 按钮可将选中文字存入收集箱而不在页面上呈现标注，Popup 与 Dashboard 会使用独立的样式区分保存项并提供一键降级 / 升级。
- 🎨 **可定制调色板**：提供 5 色调色板并记忆最近使用的颜色，支持快速编辑颜色值。
- 🔔 **操作栏角标**：扩展图标会实时显示当前页面的标注数量，方便浏览时掌握进度。
- 🛡️ **稳健的高亮回放**：所有数据持久化在 `chrome.storage.local`，重新访问同一页面时自动恢复，并且在 DOM 变化时自动轮询重试；若仍无法定位，会通过页面内 toast 与 Popup 异常提示提醒处理。
- 🚫 **重叠保护**：新建标注时若所选范围与已有标注重叠会即时提示并拒绝创建，避免相互嵌套导致定位错乱。
- 🔁 **SPA 感知恢复**：监听 History API 与 URL 变更自动触发 `scheduleRestoreIfUrlChanged`，在单页应用内导航后即时重刷高亮与角标；Twitter 这类客户端内跳转现在无论点击推文还是前进/后退都能立即恢复。
- 📑 **富文本保真**：采集时保留链接、列表、引用、代码块等基础结构，展示与导出时按需转换为 Markdown。
- 🧰 **管理中心**：Dashboard 支持卡片 / 列表视图（记忆上次选择）、标签多选、全文搜索、日期范围与网站筛选，并采用懒加载保障性能；同时提供 JSON 导入，支持「跳过 / 覆盖 / 保留最新」三种冲突策略并显示导入摘要，设置页齿轮按钮增大字号并加上外轮廓更醒目。
- 🗂️ **侧边详情面板**：点击任意高亮即可在页面右侧打开固定位置的详情面板，支持复制 Markdown、编辑、删除。
- 🔄 **LogSeq 增量同步**：通过官方 HTTP API 在目标页面插入或恢复缺失块，自动追踪 `logseqBlockUuid`，仅同步新增或丢失的标注，并在写入前将 HTML 转换为 Markdown（含 `<pre>` 代码块）。
- ℤ **统一图标集**：扩展图标与操作栏图标统一为带有「ℤ」符号的视觉语言，浮动工具条、Popup、Dashboard 按钮全面改用自研 SVG 图标，跨浏览器保持一致并提供亮/暗色双版本资源。
- 🧘 **禅定模式（Zen Mode）**：在包含文章主体的页面一键进入沉浸式阅读，仅保留文章区域并优化打印样式；不改变 DOM 结构，确保高亮路径与恢复不受影响。支持右键菜单一键切换，并在启用后显示「保存文章为图片」的上下文菜单以便导出。

## 快速开始（开发者）

项目的前端 UI 已从原有的常规 JS/React 架构迁移为 Vue 3 + JSX（使用 Vue 的 Composition API 与 JSX 语法），并且使用 `@crxjs/vite-plugin` 在 Vite 中构建符合 MV3 的扩展包。核心业务逻辑（background/content/shared helpers）保留在 `myz-annotator/src` 下。

基本开发步骤：

1. 安装依赖：

   ```bash
   npm install
   ```

2. 本地开发：

   - 运行开发服务器（启动 Vite）

     ```bash
     npm run dev
     ```

     这会启动 Vite（含 Vue + JSX 支持）。注意：Service Worker（background）不能像普通页面那样实现完整的 HMR；当修改背景脚本或 content script 时，仍需在 `chrome://extensions/` 中手动重新加载扩展或重启 Service Worker。

3. 生成发布构建：

   ```bash
   npm run build
   ```

   构建输出位于 `dist/`（或由 `vite`/`@crxjs/vite-plugin` 指定的输出目录），将该目录作为已解压扩展加载到 Chrome（或压缩上传到 Chrome Web Store）。

4. 在 `chrome://extensions/` 中启用「开发者模式」，点击「加载已解压的扩展程序」，选择构建输出目录（`dist/` 或相应产物）。

### 自动化测试（Playwright）

我们使用 Playwright 来做端到端的回归与交互测试（因为扩展需要以 unpacked extension 的形式在 Chromium 中以 headed 模式运行，Playwright 提供了合适的 API 来启动带有用户数据目录的 Chromium 并加载扩展）。测试覆盖范围会同步维护在 `docs/acceptance-criteria.md` 中。

本仓库的 Playwright 测试位于 `myz-annotator/tests/`，主要覆盖：

- 浮动工具条出现、应用高亮并持久化（AC-01/AC-02/AC-03）
- 阻止与断言重叠标注（`highlight-overlap.spec.js`），并覆盖「保存文字」的交互路径。
- Popup / Dashboard 交互（保存、复制、编辑、降级、导入/导出）
- 复杂页面高亮与导出格式（代码块、pre 格式化）
- 截图工具端到端（使用 Playwright 的 download 事件断言）

快速运行（在 `myz-annotator/` 目录下）：

```bash
npm install
# 构建扩展（Playwright 测试会加载 dist/）
npm run build
# 运行 Playwright 测试套件（tests/playwright.config.ts 已将 headless 设为 false）
npx playwright test tests --config=tests/playwright.config.ts
```

调试建议：
- Playwright 需要 headful Chromium（`headless: false`），在 Linux CI 上我们使用 `xvfb-run` 或 Playwright 官方 Docker 镜像来提供虚拟显示。详见仓库 `.github/workflows/extension-ci.yml`。
- 测试运行将打开带有临时用户数据目录的 Chromium 实例并加载 `dist/` 扩展；若要在本地可视化交互，请不要在 CI 模式中运行 `--headless`。
- 如果测试失败，请启用 Playwright 报告与 trace（CI 配置已启用 HTML 报告并上传为 artifact），或在本地使用 `npx playwright show-report` 查看失败回放。
- 新增的批注重叠防护、SPA 导航恢复、暗色调色板等能力均已有对应测试；新增功能时请为 toolbar、modal、背景消息流补齐断言。

新增测试用例与回归检查

在最近的回归中，我们修复了“保存文字（保存 clip）”按钮不会真正保存的问题（原因：toolbar 的 click handler 未把选中文本写入 `state.currentText`，导致 modal submit 的早退保护触发）。为了防止回归，测试套件新增了以下用例：

- `save_clip_via_toolbar_persists_to_dashboard`：在页面选择文本，点击浮动工具条的「保存文字」，提交 modal，然后打开 Dashboard 验证后台存储中包含该 clip（断言匹配选中文本）。

我们推荐在变更内容会影响 content script、toolbar 或 modal 的时候，先运行相关 Playwright 测试，再把变更 push 到 PR，CI 将在 PR 上自动运行整套测试并上传报告。

### 常用操作

- **新建高亮**：选中文本 → 点击浮动 ✍️ → 选择想要的颜色 / 样式 → 填写批注 / 标签 → 保存；若与现有高亮重叠会提示冲突并取消创建。
- **保存文本**：选中文本 → 点击 📝 → 直接保存为纯文本记录，可在 Popup / Dashboard 中继续编辑或转换为标注。
- **截图选区**：选中文本 → 点击 📸 → 自动去除系统选区高亮后保存 PNG。
- **查看 / 编辑**：点击高亮或在 Popup、Dashboard 中查看详情，支持 Markdown 复制与快速定位。
- **导出 / 导入**：Dashboard 左侧导出面板可生成 JSON 与 Markdown；开启 LogSeq 同步后出现同步按钮。设置页新增 JSON 导入入口，可选择冲突策略并查看导入统计。

## LogSeq 同步配置

1. 在 LogSeq 桌面端开启 Developer Mode 与 HTTP API（默认端口 `http://127.0.0.1:12315/api`）。
2. 打开 Dashboard → ⚙️ 设置页，启用同步开关并填写：
   - **Endpoint**：LogSeq API 地址（自动记忆最近成功的端点）。
   - **Token**：如启用鉴权，请使用 `Bearer <token>` 或直接填入 token。
   - **Page**：目标页面名称（默认 `MyZ Inbox`）。
3. 点击「同步 LogSeq」按钮后，后台会：
   - 确认页面存在或自动创建根块；
   - 仅为缺失的高亮调用 `logseq.Editor.insertBatchBlock`；
   - 将 HTML 转成 Markdown，代码块保持为三反引号围栏；
   - 写回返回的 `uuid` 与 `logseqSyncedAt`，确保后续增量。

> 若目标块在 LogSeq 端被删除，下一次同步会重新写入并更新本地 UUID。

## 数据结构（节选）

```
{
  "highlights": {
    "myz_123": {
      "id": "myz_123",
      "kind": "highlight",
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
            "start": { "path": [...], "offset": 0 },
            "end": { ... }
         },
      "createdAt": "2025-10-24T08:00:00.000Z",
      "updatedAt": "2025-10-24T08:05:00.000Z",
      "logseqBlockUuid": "5fb4...",
      "logseqSyncedAt": "2025-10-24T09:00:00.000Z"
    }
  },
   "order": ["myz_123", "myz_456"]
}
```

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
   - 检查扩展是否涉及受限权限（当前仅 `storage`、`tabs`、`activeTab`）。
3. **打包上传**：
   - 在仓库根目录运行 `zip -r myz-extension.zip myz-annotator/*`（不可包含 `.git` 等多余文件）。
   - 登录 CWS Dashboard，创建条目并上传压缩包。
4. **填写商店信息**：
   - 产品名称、简介、详细介绍（可参考本 README）。
   - 声明该扩展在本地存储数据，并说明可选的 LogSeq 连接需要用户自有服务器。
5. **发布前检查**：
   - 通过 Chrome Beta / Stable 实机 smoke test。
   - 确认 Popup、Dashboard、LogSeq 同步在无 Token / 有 Token 场景下均可使用。
   - 检查 `manifest_version`, `service_worker` 中未使用 DOM API（已全部替换）。

## 架构与本地开发提示

- UI（Popup / Dashboard / 小组件）：使用 Vue 3 + JSX，组件位于 `myz-annotator/src/popup/` 与 `myz-annotator/src/dashboard/` 下。组件通常以 `.jsx` / `.tsx` 或 `.vue`（视情况）存在并使用 Composition API + composables。
- 共享逻辑和工具函数放在 `myz-annotator/src/shared/` 与 `myz-annotator/src/common/`。Content script 仍在 `myz-annotator/src/content/`，背景脚本在 `myz-annotator/src/background/`。
- 使用 `readState` / `writeState` 等 storage helpers 操作 `chrome.storage.local`（state namespace 仍为 `myz::highlights` 与 `myz::settings`）。
- 背景脚本运行在 MV3 Service Worker 环境：避免使用 DOM API（例如 `document`、`window` 的 DOM 操作），并确保异步 API 的错误被妥善捕获与记录。
- 当修改背景脚本或 content script 时，手动在 `chrome://extensions/` 中重新加载扩展或点击 Service Worker 的 "更新"。UI 更改（Popup/Dashboard）在开发模式下可通过 Vite 的 HMR 快速查看。

更多实现细节请参考仓库内的 `docs/knowledges/` 文档（例如 `docs/knowledges/logseq-http-api.md`）。

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
  - 编辑 `myz-annotator/src/content/zen-config.js`，按需追加规则（从上到下，第一个命中生效）：

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
  - 若右键菜单未出现，说明当前页面未检测到可识别的文章主体。可在 `zen-config.js` 中添加匹配规则后重载扩展。
  - 某些站点在 SPA 导航后需要等待内容渲染完成，菜单会在页面完成加载时自动刷新显示/隐藏与标题。
  - 如遇文章主体选择器与站点样式冲突，可在 `ZEN_SELECTOR_MAP` 中为特定域名添加更精确的选择器，或临时禁用该页的样式隔离进行验证。
