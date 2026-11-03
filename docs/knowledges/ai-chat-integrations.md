# 外部 AI 聊天站接入事实（DeepSeek / Qwen）

本文记录「解读」按钮在 `chat.deepseek.com` / `chat.qwen.ai` 上实测到的 DOM 与路由约定
（2026-10-29，Chrome 152 + 已登录账号）。实现见 `myz-annotator/src/ai/providers.ts`、
`content/ai-compose.ts`、`background/messages/ask-ai.ts`。

> **隐私**：该功能默认关闭，设置页明确标注「第三方可能收集/泄露数据」的风险，并声明
> MyZ 自身不提供线上服务、不收集用户数据；只有用户手动开启后，工具栏才会出现按钮。
>
> **首要原则：只依赖结构与路由，不依赖文案。** 两个站点都会按账号/地区切换语言
> （同一账号实测过中文与英文界面），类名也基本是哈希的。

## 路由

| | DeepSeek | Qwen |
|---|---|---|
| 新对话 | `https://chat.deepseek.com/` | `https://chat.qwen.ai/` |
| 会话 | `/a/chat/s/<id>` | `/c/<id>`（另有 `/c/local`、`/c/guest`） |
| 登录页 | `/sign_in`、`/login` | `/auth?action=signin`（`/auth` 路径） |

因此「是否新对话」看 `provider.newChatPaths`：根路径，加上 Qwen 的草稿路由（`/c/new-chat`、`/c/local`、`/c/guest`）。其余（如 `/a/chat/s/<id>`、`/c/<id>`）一律视为旧会话 → 切到新对话。

## 输入框

- 两边都是**单个可见 `<textarea>`**，且是页面上面积最大的可编辑区：
  - DeepSeek：`textarea`（无 id，class 哈希 + `ds-scroll-area`）
  - Qwen：`textarea.message-input-textarea`
- 通用定位：`textarea, [contenteditable="true"], [role="textbox"]` 里面积最大的可见元素。
- 写值：**不能**直接 `el.value = text`（React 受控组件的 value tracker 会忽略）。取
  `Object.getPrototypeOf(el)` 上的原生 `value` setter 赋值，再派发 `input`（+`change`），
  发送按钮随之从不可用变为可用（Qwen 的 `button.send-button` 甚至只在有内容时才渲染）。

## 图片

- 两边都存在隐藏的 `input[type=file]`（DeepSeek 带一长串 accept，Qwen `accept=""` + `multiple`）。
- 在输入框上派发 `paste`（`ClipboardEvent` + `DataTransfer` 携带 `File`）会被页面消费
  （`preventDefault()`），并生成附件预览：
  - DeepSeek：`img`（`blob:` 预览）
  - Qwen：`img.user-img`（`data:` 缩略图，异步出现，约 1–2s）
- 若 paste 未被消费，回退为「给隐藏 file input 赋 `files` 再派发 `change`」。
- Qwen 未登录（游客）时粘贴图片会弹出「欢迎使用 Qwen」引导弹窗；登录后正常。

## 切换新对话（不整页 reload）

三层，逐级降级；**只有验证过切换成功才写入**：

1. **点页面内控件**（SPA 路由切换，不 reload；慢启动站点尤其重要）
   - Qwen：登录态是 `div.sidebar-entry-fixed-list-content`（侧栏「新建对话」，`aria-label` 会本地化），未登录落地页是 `div.new-chat`；实测点它 → 路由到 `/`、document 不重载。
   - DeepSeek：**没有**可用的结构化选择器（新建对话行是哈希 class `_5a8ac7a` + 本地化文案），不走这一层。
2. **驱动路由**：`history.pushState("/") + dispatchEvent(new PopStateEvent("popstate"))`。
   - 已实测 DeepSeek 生效：真实会话页执行后正文从对话变为新对话问候（`Hi. What can I do for you?`），无 reload。
   - 只靠「URL 变了」不算成功：还要**视图确实换了**（正文文本变化或输入框元素被替换）；否则把 URL 还原并降级到第 3 层。
3. **URL 兜底**：`chrome.tabs.update({ url: newChatUrl })`，等新文档就绪（`status === "complete"` 且路径正确）再投递。

**防止把内容塞进旧对话**（关键）：`myz:aiCompose` 带 `expectNewChat`，content 侧在写任何东西之前
必须确认自己在 new-chat 路径；切不过去就返回 `not-ready`（一个字都不写），由后台做兜底导航后重投。

## 目标标签页选择

`pickChatTab()` 的优先级：**已经是分屏窗格里的那个 provider 页** → 本页此前的会话记录 →
当前激活 → 最近一个。分屏里已有对应页面时直接用它，绝不另开标签页。

## 模式开关
- DeepSeek：`.ds-toggle-button` + `aria-pressed`，两个按钮分别是「深度思考」「智能搜索」。
  语言会变，但 `aria-pressed` 结构稳定；按标签正则匹配，兜底用「排除搜索按钮」。
- Qwen：**没有** `aria-pressed` 开关。「选择模式/Select Mode」（`[aria-label="Select Mode"]`）
  是工具菜单（上传附件 / 创作图片 / 创作视频 / 联网搜索 / 深度研究 / Web Dev / 幻灯片），
  文案随语言变化，且属于「本轮任务类型」而非「推理开关」，因此**不自动操作**。
  模型选择在 `[aria-label="Select Model"]`（`Qwen3.7-Plus` 等）。
- 结论：`AiProvider.thinkToggle` 只有 DeepSeek 配置，Qwen 留空（compose 时跳过）。

## 登录态

- DeepSeek 未登录访问根路径会 302 到 `/sign_in` → 可由 URL 判定。
- Qwen 未登录仍渲染输入框（游客模式），因此 compose 不会失败；发送时才提示登录。
  也就是说 Qwen 的「未登录提醒」不会由我们的 URL 判定触发，这是站点行为差异，
  不要为了提醒去做文案匹配。

## 会话复用（同页面连续解读）

见 `docs/plan/implemented/ai-session-reuse.md`。要点：记录源页 tab/URL 与聊天页
tab/URL；四项任一变化即开新会话；唯一例外是「根路径 → 会话路径」（用户发送后站点换
URL），视为同一会话并立即回写。
