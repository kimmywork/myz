# myz-bot

`myz-bot` 现在采用固定 runtime + 显式 workspace 的布局：

- runtime 固定在 `~/.myz-bot`
- `bot.yml` 固定在 `~/.myz-bot/bot.yml`
- workspace 默认为当前执行目录，也可以通过 `-w <path>` 指定
- 生产启动推荐只用 `launch`，不要长期裸跑 `serve`

## Commands

- `npx myz-bot -- init -w /abs/path/to/workspace`
  - 交互式初始化 Telegram / LLM 配置
  - 写入 `~/.myz-bot/bot.yml`
  - 在 workspace 创建 `AGENTS.md`、`BOOTSTRAP.md`、`SOUL.md`、`IDENTITY.md`、`USER.md`、`memory/MEMORY.md`、`.gitignore`
- `npx myz-bot -- serve -w /abs/path/to/workspace`
  - 直接启动 worker 进程
  - 适合开发、调试、短时运行
- `npx myz-bot -- launch -w /abs/path/to/workspace`
  - 启动内置 launcher supervisor
  - 推荐生产模式
  - `/ops restart` 和 `/ops upgrade apply` 依赖这个模式自动接管重启
- `npx myz-bot -- check -w /abs/path/to/workspace`
  - 检查 Telegram 和 LLM 连通性
- `npx myz-bot -- upgrade status -w /abs/path/to/workspace`
- `npx myz-bot -- upgrade check -w /abs/path/to/workspace`
- `npx myz-bot -- upgrade apply -w /abs/path/to/workspace`
  - 只会在 launcher 模式下自动 apply
- `npx myz-bot -- migrate-layout -w /abs/path/to/workspace`
  - 把旧版“workspace 里混放 runtime”的布局迁移到新结构
- `npm test`
  - 运行 `node --import tsx --test tests/*.test.ts`

## Runtime And Workspace

### Runtime

全局配置和每个 workspace 的运行态数据都放在 `~/.myz-bot`：

- `bot.yml`
- `workspaces/<workspaceId>/conversations/`
- `workspaces/<workspaceId>/permissions/`
- `workspaces/<workspaceId>/relationships/`
- `workspaces/<workspaceId>/soul/`
- `workspaces/<workspaceId>/system/`

`system/` 里目前会维护：

- `launch.json`
- `upgrade-state.json`
- `restart-request.json`
- `layout-migration.json`

### Workspace

workspace 只保留协作文档和长期记忆：

- `AGENTS.md`
- `BOOTSTRAP.md`
- `SOUL.md`
- `IDENTITY.md`
- `USER.md`
- `memory/MEMORY.md`
- `memory/YYYY-MM-DD.md`

默认 `.gitignore` 只放行这些 Markdown 文档，其他工作区文件模式默认忽略。

## bot.yml

`workspaceRoot` 已废弃且会被忽略。workspace 只能由 CLI 的 `-w` 决定。

```yaml
telegram:
  username: "your_bot_username"
  token: "${TELEGRAM_BOT_TOKEN}"
  allowedUsers: []
  allowedChats: []
  adminUsers: []
  saveIncomingMedia: true
  groupResponseMode:
    onlyWhenMentioned: true
    allowReplyToBot: true
    allowAdminCommands: true
  retry:
    retries: 2
    baseDelayMs: 800

network:
  requestTimeoutMs: 180000
  connectTimeoutMs: 10000
  keepAliveTimeoutMs: 4000
  keepAliveTimeoutThresholdMs: 2000
  proxyUrl: ""

ai:
  provider: openai_compatible
  baseUrl: "https://api.openai.com/v1/chat/completions"
  accessToken: "${OPENAI_API_KEY}"
  headers: {}
  model: "gpt-4o-mini"
  systemPromptInUserMessage: false
  retry:
    retries: 2
    baseDelayMs: 1000
  capabilities:
    toolCalling: true
    reasoning: false
    vision: false
    imageOutput: false
  limits:
    contextWindow: 8192
    maxOutputTokens: 1024
    maxOutputTokenParam: max_tokens
  tooling:
    toolChoice: auto
    strict: auto
    parallelToolCalls: auto

mcpServers: []
skills:
  sources: []
  allowlist: []
  denylist: []
tools:
  allowlist: []
  denylist: []
scheduler:
  enabled: true
  pollIntervalMs: 15000
  maxBatchSize: 20
  failureRetryBaseDelayMs: 60000
upgrade:
  enabled: true
  packageName: "myz-bot"
  channel: "latest"
  checkIntervalMs: 21600000
  strategy: "notify"
  applyMode: "manual"
  allowPrerelease: false
context:
  maxHistoryMessages: 120
  maxHistoryChars: 120000
  compressionThreshold: 160
  compressionCooldownMs: 300000
  summaryMaxMessages: 20
  summaryMaxChars: 6000
soul:
  autoDraft: true
  autoApply: true
  reviewRequired: true
  autoDraftMessageInterval: 40
  autoDraftTimeIntervalMs: 14400000
  growthFeedbackBatchMessageInterval: 20
  growthFeedbackTimeIntervalMs: 3600000
  relationshipReflectionMessageInterval: 20
  relationshipReflectionTimeIntervalMs: 3600000
```

## Tool Paths

提供给 agent 的虚拟路径只有两类：

- `/workspace`
  - 当前 workspace 根目录
  - `Run` 的默认工作目录也在这里
- `/attachments`
  - 当前会话已保存的附件目录
  - 只读

不再暴露 `/bot`，agent 也不允许直接读取 runtime。

## Memory Model

记忆改成 Markdown-first：

- 长期整理记忆在 `memory/MEMORY.md`
- 日志型共享记忆和会话摘要按日期写入 `memory/YYYY-MM-DD.md`
- 旧版 `memory/index.json`、`memory/notes/`、`memory/conversation-summaries/` 会在首次访问时自动迁移

管理员命令：

- `/ops reset-memory [current|all] [journal|full]`
  - `journal` 只清日记型记忆
  - `full` 额外清空 `memory/MEMORY.md`

## Telegram Behavior

- 私聊默认响应
- 群聊默认只响应 `@bot`、回复 bot，或管理员命令
- 附件会保存到当前会话 runtime，并以 `/attachments/<file>` 暴露给 agent
- 在需要回复的会话里，bot 会用 `sendChatAction` 暴露当前正在忙，不把这类状态写入 `telegram-history.jsonl`
- 完成一轮处理后，bot 会用 `setMessageReaction` 给触发消息打结果标记；当前实现使用 Telegram 允许列表里的 `👌` / `👎`
- `/skills`、`/todo`、`/permit`、`/soul`、`/ops` 都保留可用

`/ops` 当前支持：

- `status`
- `usage [current|all]`
- `reset-memory [current|all] [journal|full]`
- `housekeeping [current|all]`
- `upgrade [status|check|apply]`
- `restart`

## Upgrade Notes

- `launch` 会维护 `system/launch.json`
- `upgrade check` / `/ops upgrade check` 会更新 `system/upgrade-state.json`
- `upgrade apply` / `/ops upgrade apply` 会写入 `system/restart-request.json`
- 只有 launcher 模式会自动 apply 升级
- `serve` 裸跑时可以检查版本，但不会承诺无人值守升级
- launcher 收到带 `targetVersion` 的重启请求后，会用 `npx -y <package>@<version> launch -w ...` 做代际 handoff

## Migration

如果历史工作区里还混放这些旧目录：

- `bot.yml`
- `conversations/`
- `permissions/`
- `relationships/`
- `soul/`

执行 `migrate-layout -w <workspace>` 会把 runtime 部分搬到 `~/.myz-bot/workspaces/<workspaceId>/`，同时保留 workspace 文档并触发 memory 迁移。
