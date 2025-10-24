# MyZ Annotator

MyZ Annotator 是一款 Chrome 扩展，帮助你在任意网页高亮文本、撰写批注、截图收集，并在本地管理这些资料。它支持导出 JSON / Markdown，以及与本地 LogSeq graph 进行安全的增量同步。

## 主要特性

- ✍️ **即时高亮**：选中文本自动出现浮动工具条，可一键添加批注或使用 📸 按钮截取选区图片。
- 🎨 **可定制调色板**：提供 5 色调色板并记忆最近使用的颜色，支持快速编辑颜色值。
- 🔔 **操作栏角标**：扩展图标会实时显示当前页面的标注数量，方便浏览时掌握进度。
- 🛡️ **稳健的高亮回放**：所有数据持久化在 `chrome.storage.local`，重新访问同一页面时自动恢复，并且在 DOM 变化时自动轮询重试；若仍无法定位，会通过页面内 toast 与 Popup 异常提示提醒处理。
- 📑 **富文本保真**：采集时保留链接、列表、引用、代码块等基础结构，展示与导出时按需转换为 Markdown。
- 🧰 **管理中心**：Dashboard 支持卡片 / 列表视图（记忆上次选择）、标签多选、全文搜索、日期范围与网站筛选，并采用懒加载保障性能；同时提供 JSON 导入，支持「跳过 / 覆盖 / 保留最新」三种冲突策略并显示导入摘要。
- 🗂️ **侧边详情面板**：点击任意高亮即可在页面右侧打开固定位置的详情面板，支持复制 Markdown、编辑、删除。
- 🔄 **LogSeq 增量同步**：通过官方 HTTP API 在目标页面插入或恢复缺失块，自动追踪 `logseqBlockUuid`，仅同步新增或丢失的标注，并在写入前将 HTML 转换为 Markdown（含 `<pre>` 代码块）。

## 快速开始

1. 打开 `chrome://extensions/` 并启用「开发者模式」。
2. 点击「加载已解压的扩展程序」，选择本仓库内的 `extension` 目录。
3. 安装后，点击工具栏图标即可在当前页采集内容或打开管理中心。

### 常用操作

- **新建高亮**：选中文本 → 点击浮动 ✍️ → 填写批注 / 标签 → 保存。
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

```json
{
  "highlights": {
    "myz_123": {
      "id": "myz_123",
      "url": "https://example.com/path",
      "sourceUrl": "https://example.com/path#section",
      "hostname": "example.com",
      "title": "页面标题",
      "text": "选中文本的纯文本版本",
      "html": "<pre><code>const n = 1;</code></pre>",
      "note": "批注内容，支持多行",
      "tags": ["research", "todo"],
      "color": "#fde68a",
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

## 本地开发提示

- 修改内容脚本后需在 `chrome://extensions/` 中点击「重新加载」。
- 若更新后台逻辑，可在开发者工具 → Service Workers 面板查看日志。
- `knowledges/logseq-http-api.md` 内记录了所有调用细节，可作为开发补充文档。

## 支持

遇到问题或希望新增功能，欢迎在仓库提 Issue 说明场景与复现步骤。
