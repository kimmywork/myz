import type { Message } from "@myz/ai-core/types"
import { generateReply } from "./ai"
import type { BotRuntimeConfig } from "./config"
import { createSystemMessage, createUserMessage } from "./sessions"
import { loadSoul } from "./soul"

export async function generateSoulDraftContent(options: {
  config: BotRuntimeConfig
  sessionId: string
  recentMessages: Message[]
  actor: string
}) {
  const soul = loadSoul(options.config.workspaceRoot)
  const transcript = options.recentMessages
    .slice(-12)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n\n")

  const draftConfig: BotRuntimeConfig = {
    ...options.config,
    ai: {
      ...options.config.ai,
      capabilities: {
        ...options.config.ai.capabilities,
        toolCalling: false,
      },
    },
  }

  const reply = await generateReply({
    config: draftConfig,
    sessionId: options.sessionId,
    messages: [
      createSystemMessage(
        options.sessionId,
        "你是 SOUL 设定编辑器。你必须输出完整的 Markdown 版 SOUL.md，不要输出解释。",
      ),
      createUserMessage(
        options.sessionId,
        [
          `当前操作者：${options.actor}`,
          "请基于当前 SOUL 和最近对话，生成一份新的 SOUL.md 草案。",
          "要求：保持拟人一致性；保留结构标题；不要加入工具、模型、系统实现细节；整体保持简洁，避免无限增长。",
          "只把已经稳定下来的长期结论吸收进 SOUL，不要把最近一轮反馈、成长流水、短期情绪结论直接写成长段落。",
          "边界要求：保持角色身份连续性与核心关系不变；允许依据长期反馈做渐进成长，但不允许人格突变。",
          "",
          "当前 SOUL：",
          soul.trim(),
          "",
          "最近对话：",
          transcript || "暂无最近对话",
        ].join("\n"),
      ),
    ],
  })

  return reply.content.trim() || soul
}