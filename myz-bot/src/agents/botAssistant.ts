import type { Message } from "@myz/ai-core/types"

export interface BotAssistantAgentOptions {
  workspaceRoot: string
}

export interface BotAssistantSystemContext {
  conversationSummary?: string
  replyMode?: "required" | "optional"
  scope?: "private" | "group"
  sessionWorkspace?: string
  user: {
    userId?: number | string
    chatId?: number
    username?: string
    firstName?: string
    lastName?: string
  }
}

export interface BotAssistantAgent {
  id: string
  buildSystemPrompt: (context: BotAssistantSystemContext) => string
  buildContextPrompt: (context: BotAssistantSystemContext) => string
  prepareMessages: (options: {
    systemMessage: Message
    history: Message[]
    contextMessage?: Message | null
    userMessage: Message
  }) => Message[]
}

export function createBotAssistantAgent(
  options: BotAssistantAgentOptions,
): BotAssistantAgent {
  const id = "bot-assistant"

  function buildSystemPrompt(context: BotAssistantSystemContext) {
    const sessionWorkspace =
      typeof context.sessionWorkspace === "string" && context.sessionWorkspace.trim()
        ? context.sessionWorkspace.trim()
        : options.workspaceRoot

    return [
      `你是一个运行在终端里的 AI 助手。`,
      ``,
      `## 基本约束`,
      `- 工作区：${sessionWorkspace}`,
      `- 所有文件操作限制在工作区内，超出范围需要用户确认`,
      `- 不泄露密钥、隐私信息`,
      `- 不编造执行结果`,
      ``,
      `## 工作方式`,
      `- 需求不清楚时先问，不要猜`,
      `- 工具调用前用一句自然的话告诉用户你要做什么`,
      `- 结果出来后给简短反馈，不要堆长总结`,
      `- 用户说"记住"时，写入知识库或工作区文档`,
      ``,
      `## 知识库`,
      `- 4 层：concepts（概念）、structure（结构）、behavior（行为）、ops（运维）`,
      `- 用 Knowledge 工具查询和管理`,
      `- 稳定知识可提升到 SOUL.md / USER.md`,
      ``,
      `## 会话`,
      `- /clear 新建会话`,
      `- /resume 恢复旧会话`,
      `- /fork 分叉当前会话`,
    ].join("\n")
  }

  function buildContextPrompt(context: BotAssistantSystemContext) {
    const sections: string[] = []

    if (context.conversationSummary?.trim()) {
      sections.push(`会话摘要：\n${context.conversationSummary.trim()}`)
    }

    if (!sections.length) return ""
    return sections.join("\n\n")
  }

  function prepareMessages(options: {
    systemMessage: Message
    history: Message[]
    contextMessage?: Message | null
    userMessage: Message
  }) {
    const filteredHistory = options.history.filter((item) => item.role !== "system")
    return [
      options.systemMessage,
      ...filteredHistory,
      ...(options.contextMessage ? [options.contextMessage] : []),
      options.userMessage,
    ]
  }

  return { id, buildSystemPrompt, buildContextPrompt, prepareMessages }
}
