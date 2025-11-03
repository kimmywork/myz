# 常见问题（FAQ）

## 为什么安装后没有看到工具条？
请先选中页面中的文字，浮动工具条会在选区附近出现。若依然不可见，请在 `chrome://extensions/` 中重新加载扩展后重试。

## 标注会丢失吗？
数据保存在 `chrome.storage.local`。重新访问同一页面会自动恢复；若 DOM 变化导致无法定位，系统会提示你处理（可将其降级为纯文本保存）。

## 如何导入/导出？
在 Dashboard 顶部菜单中可导出 JSON/Markdown；导入时支持「跳过 / 覆盖 / 保留最新」策略，并显示导入摘要。

## 如何反馈问题？
请在仓库[提交 Issue](https://github.com/myz-suite/myz-support/issues)，附带浏览器版本、页面链接、复现步骤与截图。

