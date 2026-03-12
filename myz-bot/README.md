# myz-bot

## 命令
- `npx myz-bot -- serve`：启动 Telegram Bot（默认命令，可省略 `serve`）
- `npx myz-bot -- init`：在当前目录生成 `bot.yml`、`SOUL.md`，并创建 `memory/`、`conversations/`
- `npx myz-bot -- check`：检测 Telegram 与 LLM 连接性（getMe + 发送一条测试消息）

## 配置文件
### bot.yml
```yaml
telegram:
  username: "your_bot_username"
  token: "${TELEGRAM_BOT_TOKEN}"

ai:
  provider: openai_compatible
  baseUrl: "https://api.openai.com/v1/chat/completions"
  accessToken: "${OPENAI_API_KEY}"
  headers: {}
  model: "gpt-4o-mini"
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
conversationsDir: "conversations"
memoryDir: "memory"
```

### SOUL.md
用于定义人设与表达风格（名字、外观、性格、语气等）。

## 目录结构
- `conversations/`：按 `chatId-userId` 分目录存储会话历史
- `memory/`：共享记忆
