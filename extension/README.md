# MyZ Annotator

一个用于浏览器内随时高亮网页文字、撰写批注，并在本地管理导出的 Chrome 扩展。支持将高亮内容导出为 JSON/Markdown，同时可以同步给本地 LogSeq 服务器。

## 功能概览

- 在任意网页选中文本后弹出 ✍️ 操作按钮创建高亮，同时提供 📸 截图按钮，可直接保存当前选区的屏幕截图。
- 5 色可自定义调色板自动记忆最近使用的颜色，高亮与批注全部保存在浏览器 `chrome.storage.local` 中并随页面自动恢复。
- 被选内容会保留基础 HTML 结构（列表、链接、代码块等），在控制台 / Popup / 导出 Markdown 中都能还原原始格式。
- 点击高亮在页面右侧开启固定详情面板，支持复制 Markdown、编辑、删除且不遮挡正文。
- Popup 页面快速浏览当前标签页高亮、搜索、导出或唤起页面定位。
- 控制台按日期分组浏览全部高亮，支持网站、标签、日期（内置日期选择器）和全文检索，高亮搜索词会在结果中高亮，卡片 / 列表视图记忆上次选择并采用懒加载滚动。
- 控制台左侧导出区域可导出 JSON / Markdown，并在启用同步后显示 LogSeq 同步按钮。
- 新的设置页集中管理 LogSeq 地址、Graph、Token 及同步开关，自动尝试常见本地端口并记忆成功的端点。

## 安装调试

1. 在 Chrome 浏览器地址栏输入 `chrome://extensions/`。
2. 打开右上角「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择本仓库下的 `extension` 目录。
4. 安装后，点击工具栏图标即可使用。

## 使用说明

- **创建高亮**：在网页中选中文本，点击浮动按钮「✍️」填写批注、标签及颜色后保存；若仅需截图，可直接点击「📸」按钮保存选区图片。
- **查看批注**：点击高亮在右侧打开详情面板，可复制 Markdown、编辑或删除，原始 HTML 会完整呈现。
- **Popup 管理**：点击扩展图标进入 Popup，可搜索当前页高亮、导出、复制或定位到原文。
- **控制台管理**：在 Popup 中点击「管理中心」或直接打开选项页，进行筛选、导出与 LogSeq 同步（搜索词高亮、卡片 / 列表双视图、懒加载、视图记忆及 HTML 渲染均已启用）。
- **LogSeq 同步**：打开控制台左下角的「设置」页，开启同步开关、配置服务器地址（默认尝试 `http://127.0.0.1:12315/api/logseq/markup/import` 等常见端点）、可选填写 Graph 名称与 Token，保存后即可在导出面板看到「同步 LogSeq」按钮。

### LogSeq 同步说明

1. LogSeq 需提前开启本地 HTTP Server（默认为 `http://127.0.0.1:12315`）。
2. 设置页支持 Graph、Token 及端点配置，若未指定端点会自动尝试 `api/logseq/markup/import`、`api/logseq/page`、`api/annotations` 等常见路径并记忆成功值。
3. 若服务端启用鉴权，请在设置中填写 `Bearer xxx` 形式的 Token；未开启则可留空。
4. 同步时会以 `POST` 方式发送如下 JSON：

  ```json
  {
    "title": "MyZ Annotator Export 2025-10-24T08:00:00.000Z",
    "format": "markdown",
    "content": "...",
    "timestamp": "2025-10-24T08:00:00.000Z",
    "graph": ""
  }
  ```
5. 若返回 `401 Unauthorized`，表示 LogSeq 端未通过认证：
  - 确认 LogSeq Server 已开启身份校验；
  - 在设置中填写与服务器一致的 Token；
  - 再次点击同步即可。

## 数据结构

所有高亮存储于 `chrome.storage.local` 的键 `myz::highlights` 中，结构如下：

```json
{
  "highlights": {
    "myz_xxx": {
      "id": "myz_xxx",
      "url": "https://example.com/path",
      "sourceUrl": "https://example.com/path#section",
      "hostname": "example.com",
      "title": "页面标题",
  "text": "被高亮的原文（纯文本）",
  "html": "<blockquote>保留基础格式的 HTML</blockquote>",
      "note": "批注内容",
      "tags": ["tag1", "tag2"],
      "color": "#ffe58f",
      "range": { "start": { "path": [...], "offset": 0 }, "end": { ... } },
      "createdAt": "2025-10-24T08:00:00.000Z",
      "updatedAt": "2025-10-24T08:00:00.000Z"
    }
  },
  "order": ["myz_xxx", "myz_yyy"]
}
```

## 备注

- 扩展默认对 `<all_urls>` 注入内容脚本，仅在本地浏览器中持久化，未上传至云端。
- 高亮恢复依赖 DOM 结构路径，如果页面结构变化较大，可能无法定位原文。
- LogSeq 同步接口仅提供简单的 `POST` 请求，具体需与本地 LogSeq 服务的 API 保持一致。
