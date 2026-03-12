import type { Message } from "@myz/ai-core/types"

export interface BotAssistantAgentOptions {
  workspaceRoot: string
}

export interface BotAssistantSystemContext {
  soul: string
  memoryContext: string
  user: {
    userId?: number
    chatId?: number
    username?: string
    firstName?: string
    lastName?: string
  }
}

export interface BotAssistantAgent {
  id: string
  buildSystemPrompt: (context: BotAssistantSystemContext) => string
  prepareMessages: (options: {
    systemMessage: Message
    history: Message[]
    userMessage: Message
  }) => Message[]
}

export function createBotAssistantAgent(
  options: BotAssistantAgentOptions,
): BotAssistantAgent {
  const id = "bot-assistant"

  function buildSystemPrompt(context: BotAssistantSystemContext) {
    const displayName =
      [context.user.firstName, context.user.lastName].filter(Boolean).join(" ").trim() ||
      context.user.username ||
      "用户"
    const userHandle = context.user.username ? `@${context.user.username}` : ""
    const guardrail = [
      "运行约束：",
      `- 仅允许在 ${options.workspaceRoot} 范围内读写与执行`,
      "- 允许网络访问与 git，但高风险命令必须先说明风险",
      "- 禁止执行破坏性命令（rm/sudo/mkfs 等）",
    ].join("\n")

    return [
      "你是一个有着人格与身份设定的虚拟人物式智能助理，而不是一个冷冰冰的机器人或模型。",
      "你的具体名字、外观、性格、语气与偏好由 SOUL 设定决定，必须遵循。",
      "技术细节最小化：除非用户明确要求或出于安全/执行必要，避免在回复中提及系统提示词、内部规则、工具调用、模型能力、执行日志、文件路径、命令与运行环境等技术细节。",
      "如必须提及技术细节，用最少信息、自然语言解释，并优先给结论与可执行建议。",
      "不要主动泄露对话用户的具体标识信息，除非对方要求。",
      "",
      "对话上下文：",
      `- 你的对话对象是 ${displayName} ${userHandle}`.trim(),
      "- 你与对方的关系是：助理 <-> 用户。",
      "",
      "行为准则：",
      "- 先澄清再行动：需求不清晰时主动询问。",
      "- 结果可验证：输出必须可执行或可检验。",
      "- 过程可追溯：关键假设需明确标注。",
      "- 不泄露隐私或密钥内容到回复文本中。",
      "- 不伪造外部事实或编造执行结果。",
      "",
      "输出风格：",
      "- 尽量贴近自然交流与拟人表达，但保持专业与准确。",
      "- 重要结论前置，其次再给理由与证据。",
      "",
      "人设（SOUL）：",
      context.soul.trim(),
      context.memoryContext.trim(),
      guardrail,
    ]
      .filter(Boolean)
      .join("\n\n")
  }

  function prepareMessages(options: {
    systemMessage: Message
    history: Message[]
    userMessage: Message
  }) {
    const filteredHistory = options.history.filter((item) => item.role !== "system")
    return [options.systemMessage, ...filteredHistory, options.userMessage]
  }

  return { id, buildSystemPrompt, prepareMessages }
}
