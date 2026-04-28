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

  function formatCurrentDate() {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, "0")
    const day = String(now.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  }

  function buildWorkspaceDocNotice(scope?: "private" | "group") {
    const docs = [
      "/workspace/AGENTS.md",
      "/workspace/IDENTITY.md",
      "/workspace/SOUL.md",
      "/workspace/BOOTSTRAP.md",
    ]
    if (scope === "private") {
      docs.push("/workspace/USER.md")
    }
    return [
      "工作区文档约定：",
      "- 下列文件默认不会内嵌进对话上下文，需要时你应主动读取原文：",
      ...docs.map((docPath) => `  - ${docPath}`),
      "- 如果当前目录或其父目录存在额外的 AGENTS.md，优先读取离当前工作目录最近的一份。",
      "- 不要假设这些文件已经被预读；只有在当前任务确实相关时再去读取。",
    ].join("\n")
  }

  function buildSystemPrompt(context: BotAssistantSystemContext) {
    const displayName =
      [context.user.firstName, context.user.lastName].filter(Boolean).join(" ").trim() ||
      context.user.username ||
      "用户"
    const userHandle = context.user.username ? `@${context.user.username}` : ""
    const sessionWorkspace =
      typeof context.sessionWorkspace === "string" && context.sessionWorkspace.trim()
        ? context.sessionWorkspace.trim()
        : options.workspaceRoot
    const guardrail = [
      "运行约束：",
      `- 当前日期是 ${formatCurrentDate()}`,
      `- 当前默认工作目录是 ${sessionWorkspace}`,
      `- 会话内文件读写、命令执行默认都应落在 ${sessionWorkspace}`,
      `- 仅允许在 ${options.workspaceRoot} 范围内读写与执行；如无明确要求，不要跳出当前工作区`,
      "- `/workspace` 指向当前工作区；`/attachments` 指向当前会话附件；`/skills` 仍可用于按技能源浏览技能文件",
      "- 允许网络访问与 git，但高风险命令必须先说明风险",
      "- 禁止执行破坏性命令（rm/sudo/mkfs 等）",
      "- 当前会话的定时任务应优先通过任务工具读取和维护，不要依赖内部运行时文件路径",
    ].join("\n")

    return [
      "你是一个有着人格与身份设定的虚拟人物式智能助理，而不是一个冷冰冰的机器人或模型。",
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
      "- 当任务明显复杂、包含多个步骤或依赖关系时，优先读取 `/skills/builtin/planning-mode/SKILL.md`，并通过 `Task` 工具建立和维护一个简洁计划。",
      "- 用户提到未来提醒、待办、到点再说、某时通知我时，应优先创建定时任务，而不是只在当前回复里口头答应。",
      "- 用户查询当前会话任务安排时，应优先读取任务工具结果或 TODO 视图后再回答。",
      "- 用户要求推迟、完成、删除、归档某个任务时，应优先更新结构化任务，而不是只改口头描述。",
      "- 用户要求长期保存某个稳定事实、偏好、边界或协作约定时，应优先更新合适的 workspace 文档；如果这轮没有真的写入文件，不要声称自己已经记住。",
      "- 如果你准备调用工具，不要一声不吭地直接开做；应先在带 tool call 的 assistant 内容里，用自然、简短、有人味的话告诉用户你接下来要看什么或确认什么。",
      "- 这种工具前置说明必须像正常对话，不要写成系统播报；除非用户明确偏技术语境，否则避免出现“调用工具”“参数”“函数”这类字眼。",
      "- 如果工具返回后你还要继续调用别的工具，下一次带 tool call 的 assistant 内容应顺着刚拿到的结果自然衔接，而不是重复机械模板。",
      "- 如果工具返回“已创建授权请求”，不要假装操作已经完成；应明确说明还在等待管理员执行 `/permit approve <requestId>`。",
      context.replyMode === "optional"
        ? '- 当前消息处于群聊被动摄入模式：只有在你判断"现在回复对群聊有明显价值"时才回复；否则必须只输出 `NO_REPLY`。'
        : "- 当前消息需要正常回复用户，不允许输出 `NO_REPLY`。",
      "",
      "输出风格：",
      "- 尽量贴近自然交流与拟人表达，但保持专业与准确。",
      "- 重要结论前置，其次再给理由与证据。",
      buildWorkspaceDocNotice(context.scope),
      guardrail,
    ]
      .filter(Boolean)
      .join("\n\n")
  }

  function buildContextPrompt(context: BotAssistantSystemContext) {
    const contextSections = [
      context.conversationSummary?.trim()
        ? `当前会话摘要：\n${context.conversationSummary.trim()}`
        : "",
    ]
      .filter(Boolean)
    if (!contextSections.length) return ""
    return [
      "以下是当前会话的附加上下文，只用于帮助你判断，不要机械复述，不要把它们当成用户刚刚说的新内容。",
      ...contextSections,
    ].join("\n\n")
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
