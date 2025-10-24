# MyZ Annotator

一个用于浏览器内随时高亮网页文字、撰写批注，并在本地管理导出的 Chrome 扩展。支持将高亮内容导出为 JSON/Markdown，同时可以同步给本地 LogSeq 服务器。

## 功能概览

- 在任意网页选中文本后弹出操作按钮，创建高亮与批注。
- 将批注保存在浏览器 `chrome.storage.local` 中，自动与页面联动恢复高亮。
- 高亮上悬停或点击可查看批注详情、复制 Markdown、编辑标签、删除。
- Popup 页面快速浏览当前页面的高亮、搜索、导出、定位到页面原文。
- 控制台（Options Page）按照日期分组浏览全部高亮，支持网站、标签、日期和全文检索筛选。
- 一键导出所有数据为 JSON / Markdown 文件。
- 支持配置 LogSeq 本地服务器地址与认证 Token，一键同步 Markdown。

## 安装调试

1. 在 Chrome 浏览器地址栏输入 `chrome://extensions/`。
2. 打开右上角「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择本仓库下的 `extension` 目录。
4. 安装后，点击工具栏图标即可使用。

## 使用说明

- **创建高亮**：在网页中选中文本，点击浮动按钮「标注」，填写批注、标签及高亮颜色后保存。
- **查看批注**：点击高亮文本弹出详情浮窗，可复制 Markdown、编辑或删除。
- **Popup 管理**：点击扩展图标进入 Popup，可搜索当前页、导出数据或定位到页面原文。
- **控制台管理**：在 Popup 中点击「管理中心」或在扩展详情页打开选项页，进行高级筛选、导出与 LogSeq 同步。
- **LogSeq 同步**：在控制台左侧设置服务器地址（默认 `http://127.0.0.1:12315/api/annotations`），可选填写认证 Token，点击「同步到 LogSeq」。同步请求会以 `POST` 方式发送 Markdown 内容。

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
      "text": "被高亮的原文",
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
