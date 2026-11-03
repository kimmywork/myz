# 同页面连续「解读」复用同一会话

状态：**已实施**（`src/background/ai/session.ts` + `background/messages/ask-ai.ts`）。

已确认的决策（review 结论）：

- 接受「根路径 → `/a/chat/s/<id>` 视为同一会话」的推断（R1）。
- 复用时输入框已有内容 → **覆盖**（不追加）。
- TTL **30 分钟**。
- 状态只保留 `sourceTabId / sourceUrl / chatTabId / chatUrl / updatedAt`；其中
  `tab.id`、`tab.url`、`chatUrl` 任何一项变化都开新会话（唯一例外是 R1 的跳变，
  跳到会话 URL 后立刻把它记为新的 `chatUrl`）。

## 1. 问题

现在每次点击「解读」：

- 发现聊天标签页在旧会话（`/a/chat/s/<id>`）→ 导航回根路径开新对话；
- 于是同一页面连续解读两段内容时，第二段会开一个新会话，**丢掉上一轮上下文**
  （包括上一轮发过去的截图）。

期望：在同一页面连续点击时，把内容追加进**同一个**会话；换页面/换标签页/隔太久
则恢复「开新对话」。

## 2. 判定依据（只用可观测事实）

发送侧能拿到的事实只有四个：

1. 源页面：`sender.tab.id` + `tab.url`；
2. 聊天标签页：provider 匹配到的 tab 的 `id` + 当前 `url`；
3. 站点自己的会话 URL 形态：`/a/chat/s/<id>`（由 `provider.newChatUrl` 之外的路径体现）；
4. 我们自己上一次做了什么（必须记录，否则无法区分「我们刚填充的会话」和
   「用户自己的会话」）。

第 4 点是关键：**不能**仅凭「聊天标签页当前在某个会话里」就复用，否则会把选中内容
粘进用户自己的私人对话。所以需要一份会话记录。

## 3. 状态

存 `chrome.storage.session`（浏览器关闭即清空，MV3 service worker 休眠不丢；
`local` 会跨重启，隐私上没必要）：

```ts
interface AiSessionRecord {
  sourceTabId: number;      // 源页面标签页
  sourceUrl: string;        // 源页面 URL（归一化：去 hash）
  chatTabId: number;        // 我们上次填入的聊天标签页
  provider: AiProviderId;
  chatUrl: string;          // 上次填入时聊天标签页的 URL（可能是根路径）
  updatedAt: number;        // 用于 TTL 与清理
}
```

键：`myz::ai-session::<sourceTabId>`。每次写入顺带清理过期项。

## 4. 判定流程

在 `resolveChatTab()` 之前算一次 `reuse: boolean`：

```
record = 读取(sourceTabId)
if !record                              -> 不复用
if record.chatTabId !== existing?.id    -> 不复用（换了标签页/换了服务）
if record.sourceUrl !== source.url      -> 不复用（页面变了）
if record.sourceTabId !== source.id     -> 不复用（换了标签页）
if now - record.updatedAt > TTL         -> 不复用（隔太久）
switch existing.url:
  等于 record.chatUrl                    -> 复用
  是会话 URL 且 record.chatUrl 是根路径   -> 复用（见 §6 风险 R1），并回写 chatUrl
  其他（记录是会话 A、现在在会话 B）       -> 不复用
```

复用分支**跳过** `resetToNewChat()`（不导航），直接投递；不复用分支保持现状
（旧会话 → 回根路径开新对话）。

## 5. 写回与清理

- 投递成功后：重新 `tabs.get(chatTabId)` 取当前 URL，写入/刷新记录。
- 复用时如果不导航，`chatUrl` 维持上一次的值（若发生过 R1 的跳变则更新为会话 URL）。
- `chrome.tabs.onRemoved`：删除 `sourceTabId` 或 `chatTabId` 对应的记录。
- 只存 URL 与 tabId，不存选中文本或提示词。

## 6. 风险

**R1 — 「根路径 → 会话 URL」的推断**：我们填充后用户发送消息，站点把
`/` 换成 `/a/chat/s/<id>`。此时无 API 能证明这个 id 就是我们刚开的会话（用户也可能
自己在别处点了新对话）。缓解：要求记录里的 `chatUrl` 仍是根路径、TTL 内、且源页面
未变；发生跳变后立刻把记录更新为会话 URL，之后只认「完全相同」的 URL。

**R2 — 用户在会话里手动点了「新对话」**：URL 变回根路径，与 `record.chatUrl`
（会话 URL）不再相同 → 不复用。符合预期。

**R3 — 复用但输入框非空**（上次没发）：**覆盖**（已确认），不追加、不合并草稿。

**R4 — 用户自己切到别的会话**：URL 不匹配 → 不复用，开新对话（不会污染别人的会话）。

**R5 — 记录过期但用户仍想要上下文**：TTL 到期即开新对话，用保守行为换可预测性。

## 7. 实现与测试

- `background/ai/session.ts`：`shouldReuseSession()`（纯函数）、`pruneSessions()`、
  `chrome.storage.session` 读写与 `clearAiSessionsForTab()`。
- `background/messages/ask-ai.ts`：投递成功后 `rememberSession()` 回写（URL 在填充后
  重新读取）；`background.ts` 的 `tabs.onRemoved` 清理记录。
- 单测 `tests/unit/background/ai-session.test.ts`：无记录/过期/三个字段变化/相同 URL/
  根路径→会话/会话→另一会话/登录页/过期清理。
- e2e `tests/extension/ask-deepseek.spec.ts`「follow_up_on_the_same_page_reuses_the_conversation」：
  两次点击不触发聊天页导航、草稿被覆盖；源页面换 URL 后再点会回到根路径（新对话）。
