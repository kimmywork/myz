# myz-bot

## 命令
- `npx myz-bot -- serve`：启动 Telegram Bot（默认命令，可省略 `serve`）
- `npx myz-bot -- serve --config /path/to/bot.yml`：使用指定配置文件启动；该配置里的相对路径会按该 `bot.yml` 所在目录解析
- `npx myz-bot -- init`：在当前目录生成 `bot.yml`、`SOUL.md`、`AGENTS.md`、`BOOTSTRAP.md`，并创建 `.myz/skills/`、`memory/`、`conversations/`
- `npx myz-bot -- check`：检测 Telegram 与 LLM 连接性（getMe + 发送一条测试消息）
- `npx myz-bot -- check --config /path/to/bot.yml`：检测指定配置文件
- `npm test`：运行 `node --import tsx --test tests/*.test.ts`

## 配置文件
### bot.yml
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
workspaceRoot: "."
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

### SOUL.md
用于定义人设与表达风格（名字、外观、性格、语气等）。默认不再整段直接注入主 system prompt，而是由 `AGENTS.md` 驱动 bot 在需要时自行读取。

### AGENTS.md
工作区级协作约定模板。默认会结合 myz-bot 的运行特性约束会话启动、记忆、群聊行为、任务调度、权限边界、维护命令与渐进式工具反馈。bot 在启动某个工作区时会默认读取最近的 `AGENTS.md` 注入主 system prompt；通过 `List` / `Read` 访问目录内容时，也会把目标目录最近的 `AGENTS.md` 一起返回。

### BOOTSTRAP.md
首次启动引导模板。参考 OpenClaw 的 bootstrap 思路，但改成适配 myz-bot 的 Telegram 入口、SOUL 文件、任务调度和运行时目录；当身份与用户关系建立稳定后，应由 assistant 删除。

## 交互行为
- 私聊默认响应；群聊默认仅响应 `@bot`、回复 bot 的消息，或管理员命令。
- 工具路径语义统一为两层：`/bot` 指 bot 根目录，`/workspace` 指当前会话工作目录。`memory/`、`conversations/`、`.myz/skills/` 都位于 `/bot` 下。
- 若 `telegram.groupResponseMode.onlyWhenMentioned: false`，则群聊中所有消息都会进入 bot 处理链；对普通群消息也会调用 LLM，但仅当模型返回实际内容时才发送回复。被动摄入场景下，模型应返回 `NO_REPLY` 表示不回群。
- 支持文本、图片、文件、语音、转发和回复消息；媒体可保存到会话目录的 `attachments/`。
- `/skills` 可列出可见技能；`/skills/<source>/<name>` 可读取技能说明。
- `/ops` 是管理员维护命令，支持 `status`、`usage [current|all]`、`reset-memory [current|all]`、`housekeeping [current|all]`、`restart`。
- `/soul draft` 生成 SOUL 草案；`/soul apply <draftId>` 由管理员应用并自动保留历史版本。
- 当工具需要访问当前工作区之外的路径时，会自动创建权限请求；管理员可以用 `/permit list` 查看，再用 `/permit approve <requestId>` 或 `/permit reject <requestId>` 处理。也可以直接手工添加规则：`/permit grant <read|write|run> <path-or-glob>`。普通目录路径表示放开该目录子树，带 `*` 的模式会按 glob 匹配；`/permit revoke <grantId>` 可撤销。已批准的路径规则会持久保存。
- `soul.autoDraft` 默认开启。除了消息阈值以外，达到对应时间周期后也会补做 growth / relationship / auto-draft 反思，避免用户停在某轮对话后长期不结算。默认上，growth / relationship 比 auto-draft 更勤，SOUL 草案会明显更稀疏。
- 用户的鼓励、点赞、感谢、纠偏与明确风格偏好，会写入 `soul/growth.json` / `soul/growth-events.jsonl`，逐步强化或减弱 bot 的某些气质与动机。
- 角色成长不会直接覆盖 `SOUL.md`；它会先作为独立状态影响日常回复，并在 auto-draft 时渐进吸收，避免人格漂移。
- growth / relationship / SOUL 反思统一基于 `telegram-history.jsonl`，并用 Telegram message id 水位去重，不再依赖可见消息 offset 计数。
- `context/chat-chronicle.md` 会基于 Telegram 对话滚动生成长期编年摘要，供后续对话参考；它会主动压缩旧内容，不会无限追加。
- 当运行时 `llm-history.jsonl` 很薄时，bot 会触发一次 LLM 主导的跨层恢复：从 chronicle、会话摘要、growth、relationship、memory 和近期 archive 候选中挑出当前相关部分，结果缓存到 `context/recovered-context.json`。
- 当 bot 进入工具调用链时，会额外发送渐进式进度反馈；这些中间消息优先复用 assistant 在 tool-call 回合里自然写出的前置说明，必要时再由单独提示词补一句简短的人话，避免只在最后一次性发长总结。
- 这类工具进度反馈会记入 `telegram-history.jsonl` 的 `progress` 事件，但不会进入 reflection、chronicle 或恢复层候选。
- 支持会话级定时任务。LLM 可通过任务工具自动创建提醒/待办，触发后会回到原对话继续回复；`direct` 模式直接发送提醒，`llm` 模式会带上下文继续处理。
- `/todo` 可直接查看和控制当前会话任务：`/todo list`、`/todo postpone <taskId> <dueAt-ISO8601>`、`/todo complete <taskId>`、`/todo archive <taskId>`、`/todo delete <taskId>`、`/todo reopen <taskId>`。
- 当用户明确要求“记住/记下来”某个稳定事实或状态时，即使模型没有主动调用 `Remember`，bot 也会把该轮总结自动写入 `memory/notes/` 作为共享记忆。
- 当 `ai.systemPromptInUserMessage: true` 时，bot 会把 system/developer 指令改写成 user 消息发送，用于兼容不正确处理 `instructions` 的 Responses 实现。
- Telegram API 与 LLM API 都支持指数退避重试，分别由 `telegram.retry` 和 `ai.retry` 控制。
- 对话错误会记录到 `conversations/<id>/logs/errors.jsonl`；管理员收到完整错误与 stack，普通用户只收到简短错误。
- 会话任务保存在 `conversations/<id>/tasks.json`，并自动同步到 `conversations/<id>/TODO.md` 供人查看。
- `/ops housekeeping` 会把 live `llm-history.jsonl` / `llm-trace.jsonl` 归档到 `context/archive/` 后清空，同时重置 `context/recovered-context.json`；默认不删除 `telegram-history.jsonl`、任务和元数据。
- `/ops usage` 会汇总 live + archive 中 assistant 消息记录的 token usage，可按当前会话或全局统计。
- `/ops reset-memory all` 会清空 `memory/index.json`、`memory/notes/`、`memory/conversation-summaries/`；`current` 仅移除当前会话绑定的记忆与 summary。
- 每个新建会话目录都会自动生成 `.gitignore`，默认忽略 `workspace/*`，避免会话工作区文件污染 bot 自身运行时仓库。
- SOUL 自动草案和应用会记录到 `soul/audit.jsonl`，并在同一进程内串行执行，减少多个会话同时触发时的覆盖冲突。
- SOUL 在进入提示词和自动草案链路前会做结构化收敛，自动草案不会再把“角色成长状态”与“最近反馈摘要”这类波动段直接沉回基础 SOUL，避免长期膨胀。
- `soul/growth.json` / `relationships/index.json` 表示当前稳定状态；`soul/growth-events.jsonl` / `relationships/reflections.jsonl` 保留近期原始反思流水，超过阈值的旧记录会自动归档到各自的 `archive/` 目录。
- 运行态 `llm-history.jsonl` 在未触发 compression 前会保留 tool response，保证模型能看到刚发生过的工具结果；只有 compression 重写历史时才会排除 tool response，压缩摘要也不会保留 tool response / tool audit。

## 目录结构
- `conversations/`：私聊按 `chatId-userId` 分目录，群聊按 `chatId-group` 或 `chatId-thread-<id>` 分目录存储 `telegram-history.jsonl`、`llm-history.jsonl`、`llm-trace.jsonl`、`context/chat-chronicle.md`、附件、错误日志、上下文压缩记录、`tasks.json`、`TODO.md`，以及每个会话独立的 `workspace/`
- `memory/`：共享记忆与会话摘要
- `soul/`：SOUL 草案、审计日志、版本回滚文件、`growth.json` 当前成长状态、`growth-events.jsonl` 近期成长流水，以及 `archive/` 历史归档
- `relationships/`：`index.json` 当前关系状态、`reflections.jsonl` 近期关系反思流水，以及 `archive/` 历史归档
- `permissions/`：待处理权限请求和已批准的外部路径授权规则，支持目录前缀规则与 glob 规则
- `.myz/skills/`：项目侧自定义技能目录，作为默认 `project` skill source
