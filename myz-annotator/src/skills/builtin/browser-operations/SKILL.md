---
name: browser-operations
description: "浏览器操作技能：通过 ListTabs/ActivateTab/GetPageContext/RunDomActions/EvalInPage 等工具在页面中定位、阅读、交互与截图。"
license: MIT
metadata:
  version: "1.0"
  author: MyZ
---

## 目标

在浏览器页面中完成「查找元素 → 读取内容 → 交互操作 → 验证结果」的闭环。优先使用 RunDomActions + GetPageContext 等稳定工具，必要时使用截图辅助判断。

## 核心工具

- **ListTabs**：列出当前窗口的所有标签页。
- **ActivateTab**：切换/激活指定 tab。
- **GotoPage**：在当前标签页访问指定 URL。
- **NewTab**：打开新标签页访问指定 URL。
- **GetPageContext**：获取当前页面 URL / 标题 / 正文内容摘要。
- **RunDomActions**：在页面中执行 DOM 操作（定位、点击、输入、滚动、截图等）。
- **EvalInPage**：在页面上下文执行 JS（可能受 CSP 限制，失败时改用 RunDomActions）。
- **WebSearch / WebFetch**：当需要检索或阅读外部网页时使用。

> 重要：`query` / `queryViewport` 只返回可定位的标识（如 xpath）。如需文本/HTML/属性，请再用 `getText / getHtml / getAttribute` 获取详情。

## 常见操作组合

1) **切换标签页并抓取内容**
- ListTabs → ActivateTab → GetPageContext → RunDomActions(getText / getHtml)

1b) **当前页跳转**
- GotoPage → GetPageContext → RunDomActions(query / getText)

1c) **新标签页打开并抓取**
- NewTab → ActivateTab → GetPageContext → RunDomActions(query / getText)

2) **定位 + 读取**
- RunDomActions(query) → RunDomActions(getText / getHtml / getAttribute)

3) **多元素批量处理**
- RunDomActions(query, batch=5) → RunDomActions(getText, batch=5)

4) **截图辅助**
- RunDomActions(captureViewport) → 对截图进行判断

## RunDomActions 操作示例

> 通用参数：`selector` 支持 CSS / XPath（通过 `selectorType` 指定）。  
> `batch` > 1 或 `true` 时对多个元素执行，并返回多结果。

### 0) GotoPage：在当前标签页访问 URL
```json
{
  "url": "https://example.com"
}
```

### 0) NewTab：打开新标签页访问 URL
```json
{
  "url": "https://example.com",
  "active": true
}
```

### 1) query：定位元素（只返回 xpath）
```json
{
  "actions": [
    { "type": "query", "selector": "button.submit", "selectorType": "css" }
  ]
}
```

### 2) queryViewport：只返回当前视口内元素的 xpath
```json
{
  "actions": [
    { "type": "queryViewport", "selector": "article", "limit": 10 }
  ]
}
```

### 3) getText：读取文本
```json
{
  "actions": [
    { "type": "getText", "selector": "//*[@id='main']", "selectorType": "xpath" }
  ]
}
```

### 4) getHtml：读取 HTML
```json
{
  "actions": [
    { "type": "getHtml", "selector": ".content" }
  ]
}
```

### 5) getAttribute：读取属性
```json
{
  "actions": [
    { "type": "getAttribute", "selector": "a.link", "attribute": "href" }
  ]
}
```

### 6) click：点击元素
```json
{
  "actions": [
    { "type": "click", "selector": "button.next" }
  ]
}
```

### 7) input：输入内容
```json
{
  "actions": [
    { "type": "input", "selector": "input[name='q']", "value": "Hello" }
  ]
}
```

### 8) focus：聚焦元素
```json
{
  "actions": [
    { "type": "focus", "selector": "#search" }
  ]
}
```

### 9) scrollIntoView：滚动到元素
```json
{
  "actions": [
    { "type": "scrollIntoView", "selector": "footer" }
  ]
}
```

### 10) scrollBy：按偏移滚动
```json
{
  "actions": [
    { "type": "scrollBy", "scrollTop": 800 }
  ]
}
```

### 11) getRect：获取元素位置
```json
{
  "actions": [
    { "type": "getRect", "selector": ".card" }
  ]
}
```

### 12) captureViewport：截图当前视口
默认输出为 jpeg，并按视口缩放（普通屏约 0.4，高分屏 0.25）以降低体积，可通过 `quality` 调整。
```json
{
  "actions": [
    { "type": "captureViewport", "quality": 70 }
  ]
}
```

### 13) elementFromPoint：根据坐标取元素
```json
{
  "actions": [
    { "type": "elementFromPoint", "x": 200, "y": 300 }
  ]
}
```

### 14) keypress：快捷键/组合键
未提供 selector 时，默认发送到当前 activeElement。
```json
{
  "actions": [
    { "type": "keypress", "key": "k", "ctrlKey": true }
  ]
}
```

### 15) batch：批量操作（示例：批量读文本）
```json
{
  "actions": [
    { "type": "getText", "selector": ".tweet", "batch": 5 }
  ]
}
```

## EvalInPage 注意事项

- 可能被页面 CSP 阻止，失败时立即改用 RunDomActions 或 GetPageContext。
- 仅在需要复杂页面逻辑时使用，优先使用 RunDomActions。
