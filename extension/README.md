# MyZ Annotator

[Chrome 安装](https://chromewebstore.google.com/detail/myz-annotator/mhakfcbobhdemicjelhjjpmgibhnnplg)
[Edge 安装](https://microsoftedge.microsoft.com/addons/detail/myz-annotator/fepakkoggnancnpcclldodfbpgobkabj)

MyZ Annotator 是一款 Chrome 扩展，帮助你在任意网页高亮文本、撰写批注、截图收集，并在本地管理这些资料。它支持导出 JSON / Markdown，以及与本地 LogSeq graph 进行安全的增量同步。

## 主要特性

- ✍️ **即时高亮**：选中文本自动出现浮动工具条，可一键添加批注或使用 📸 按钮截取选区图片。
- 🖊️ **多样标注样式**：支持 🖍️ 高亮、✏️ 下划线、〰️ 波浪线三种样式，记忆最近使用的颜色与样式并在 LogSeq / Markdown 导出中带出描述。
- 📝 **快速保存文本**：浮动工具条新增 📝 按钮可将选中文字存入收集箱而不在页面上呈现标注，Popup 与 Dashboard 会使用独立的样式区分保存项并提供一键降级 / 升级。
- 🎨 **可定制调色板**：提供 5 色调色板并记忆最近使用的颜色，支持快速编辑颜色值。
- 🔔 **操作栏角标**：扩展图标会实时显示当前页面的标注数量，方便浏览时掌握进度。
- 🛡️ **稳健的高亮回放**：所有数据持久化在 `chrome.storage.local`，重新访问同一页面时自动恢复，并且在 DOM 变化时自动轮询重试；若仍无法定位，会通过页面内 toast 与 Popup 异常提示提醒处理。
- 📑 **富文本保真**：采集时保留链接、列表、引用、代码块等基础结构，展示与导出时按需转换为 Markdown。
- 🧰 **管理中心**：Dashboard 支持卡片 / 列表视图（记忆上次选择）、标签多选、全文搜索、日期范围与网站筛选，并采用懒加载保障性能；同时提供 JSON 导入，支持「跳过 / 覆盖 / 保留最新」三种冲突策略并显示导入摘要。
- 🗂️ **侧边详情面板**：点击任意高亮即可在页面右侧打开固定位置的详情面板，支持复制 Markdown、编辑、删除。
- 🔄 **LogSeq 增量同步**：通过官方 HTTP API 在目标页面插入或恢复缺失块，自动追踪 `logseqBlockUuid`，仅同步新增或丢失的标注，并在写入前将 HTML 转换为 Markdown（含 `<pre>` 代码块）。

## 快速开始（开发者）

项目的前端 UI 已从原有的常规 JS/React 架构迁移为 Vue 3 + JSX（使用 Vue 的 Composition API 与 JSX 语法），并且使用 `@crxjs/vite-plugin` 在 Vite 中构建符合 MV3 的扩展包。核心业务逻辑（background/content/shared helpers）保留在 `extension/src` 下。

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

### 常用操作

- **新建高亮**：选中文本 → 点击浮动 ✍️ → 选择想要的颜色 / 样式 → 填写批注 / 标签 → 保存。
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
      "range": { "start": { "path": [...], "offset": 0 }, "end": { ... } },
      "createdAt": "2025-10-24T08:00:00.000Z",
      "updatedAt": "2025-10-24T08:05:00.000Z",
      "logseqBlockUuid": "5fb4...",
      "logseqSyncedAt": "2025-10-24T09:00:00.000Z"
    }
  },
   "order": ["myz_123", "myz_456"]
}
```

## 发布到 Chrome Web Store

1. **准备素材**：
   - `manifest.json`（MV3）已就绪，确认 `version`、`description`、`host_permissions` 等符合政策。
   - `action` 图标、128×128 应用图标、以及 CWS 要求的 16 / 48 / 128 尺寸资源需准备放入 `extension/assets/`（或自定义目录）。
   - 产品截图（最少 1 张，建议多尺寸）与 1024×500 宣传横幅。
2. **隐私与政策**：
   - 起草隐私政策说明数据仅存储于本地，不与远端共享；在 CWS 提交时提供可访问的链接。
   - 检查扩展是否涉及受限权限（当前仅 `storage`、`tabs`、`activeTab`）。
3. **打包上传**：
   - 在仓库根目录运行 `zip -r myz-extension.zip extension/*`（不可包含 `.git` 等多余文件）。
   - 登录 CWS Dashboard，创建条目并上传压缩包。
4. **填写商店信息**：
   - 产品名称、简介、详细介绍（可参考本 README）。
   - 声明该扩展在本地存储数据，并说明可选的 LogSeq 连接需要用户自有服务器。
5. **发布前检查**：
   - 通过 Chrome Beta / Stable 实机 smoke test。
   - 确认 Popup、Dashboard、LogSeq 同步在无 Token / 有 Token 场景下均可使用。
   - 检查 `manifest_version`, `service_worker` 中未使用 DOM API（已全部替换）。

## 架构与本地开发提示

- UI（Popup / Dashboard / 小组件）：使用 Vue 3 + JSX，组件位于 `extension/src/popup/` 与 `extension/src/dashboard/` 下。组件通常以 `.jsx` / `.tsx` 或 `.vue`（视情况）存在并使用 Composition API + composables。
- 共享逻辑和工具函数放在 `extension/src/shared/` 与 `extension/src/common/`。Content script 仍在 `extension/src/content/`，背景脚本在 `extension/src/background/`。
- 使用 `readState` / `writeState` 等 storage helpers 操作 `chrome.storage.local`（state namespace 仍为 `myz::highlights` 与 `myz::settings`）。
- 背景脚本运行在 MV3 Service Worker 环境：避免使用 DOM API（例如 `document`、`window` 的 DOM 操作），并确保异步 API 的错误被妥善捕获与记录。
- 当修改背景脚本或 content script 时，手动在 `chrome://extensions/` 中重新加载扩展或点击 Service Worker 的 "更新"。UI 更改（Popup/Dashboard）在开发模式下可通过 Vite 的 HMR 快速查看。

更多实现细节请参考仓库内的 `knowledges/` 文档（例如 `knowledges/logseq-http-api.md`）。

## 支持

遇到问题或希望新增功能，欢迎在仓库提 Issue 说明场景与复现步骤。
