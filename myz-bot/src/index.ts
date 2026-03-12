import { mkdirSync } from "node:fs"
import { loadConfig } from "./config"
import { createTelegramClient } from "./telegram"
import { createLocalTools } from "./tools"
import { registerLocalTools } from "@myz/ai-core/tools/registry"
import { generateReply } from "./ai"
import { createBotAssistantAgent } from "./agents/botAssistant"
import { loadSoul } from "./soul"
import {
  ensureConversationDir,
  loadMetadata,
  saveMetadata,
  appendMessage,
  loadMessages,
  loadLatestSystemMessage,
  createUserMessage,
  createAssistantMessage,
  createSystemMessage,
  type ConversationMetadata,
} from "./conversations"
import { ensureMemoryDir, renderMemoryContext } from "./memory"
import { listSkills } from "./skills"
import type { Message } from "@myz/ai-core/types"

async function handleMessage(options: {
  config: ReturnType<typeof loadConfig>
  chatId: number
  userId: number
  username?: string
  firstName?: string
  lastName?: string
  text: string
  sendMessage: (chatId: number, text: string) => Promise<unknown>
}) {
  const conversationId = `${options.chatId}-${options.userId}`
  const dir = ensureConversationDir(
    options.config.conversationsDir,
    conversationId,
  )

  const now = new Date().toISOString()
  const existing = loadMetadata(dir)
  const meta: ConversationMetadata = existing || {
    schemaVersion: "1.0.0",
    conversationId,
    chatId: options.chatId,
    userId: options.userId,
    username: options.username,
    firstName: options.firstName,
    lastName: options.lastName,
    createdAt: now,
    updatedAt: now,
  }
  meta.updatedAt = now
  saveMetadata(dir, meta)

  const history = loadMessages(dir, 30)
  const skills = listSkills(options.config.skillSources)
  const userMessage = createUserMessage(conversationId, options.text, {
    skillList: skills,
  })

  appendMessage(dir, userMessage)

  const agent = createBotAssistantAgent({
    workspaceRoot: options.config.workspaceRoot,
  })
  let systemMessage = loadLatestSystemMessage(dir)
  if (!systemMessage) {
    const soul = loadSoul(options.config.workspaceRoot)
    const memoryContext = renderMemoryContext(options.config.memoryDir)
  const systemPrompt = agent.buildSystemPrompt({
    soul,
    memoryContext,
    user: {
      userId: options.userId,
      chatId: options.chatId,
      username: options.username,
      firstName: options.firstName,
      lastName: options.lastName,
    },
  })
    systemMessage = createSystemMessage(conversationId, systemPrompt, {
      source: "bot",
      agent: agent.id,
    })
    appendMessage(dir, systemMessage)
  }

  const messages = agent.prepareMessages({ systemMessage, history, userMessage })

  try {
    const reply = await generateReply({
      config: options.config,
      messages,
      conversationId,
    })
    const assistantMessage = createAssistantMessage(
      conversationId,
      reply.content || "(无响应)",
      {
        toolCallCount: Array.isArray(reply.toolCalls)
          ? reply.toolCalls.length
          : 0,
      },
    )
    if (Array.isArray(reply.toolCalls) && reply.toolCalls.length) {
      assistantMessage.tool_calls = reply.toolCalls as Message["tool_calls"]
    }
    appendMessage(dir, assistantMessage)
    await options.sendMessage(options.chatId, assistantMessage.content)
  } catch (error) {
    const message = (error as Error).message || "生成失败"
    const assistantMessage = createAssistantMessage(
      conversationId,
      `生成失败：${message}`,
      { error: message },
    )
    appendMessage(dir, assistantMessage)
    await options.sendMessage(options.chatId, assistantMessage.content)
  }
}

export async function serveBot() {
  const config = loadConfig()
  mkdirSync(config.conversationsDir, { recursive: true })
  ensureMemoryDir(config.memoryDir)

  registerLocalTools(
    createLocalTools({
      workspaceRoot: config.workspaceRoot,
      skillSources: config.skillSources,
      memoryDir: config.memoryDir,
      conversationsDir: config.conversationsDir,
    }),
  )

  const telegram = createTelegramClient({ token: config.telegram.token })
  let offset = 0

  while (true) {
    const updates = await telegram.getUpdates(offset)
    for (const update of updates) {
      offset = update.update_id + 1
      const message = update.message
      if (!message || !message.text) continue
      const from = message.from
      await handleMessage({
        config,
        chatId: message.chat.id,
        userId: from?.id || message.chat.id,
        username: from?.username,
        firstName: from?.first_name,
        lastName: from?.last_name,
        text: message.text,
        sendMessage: telegram.sendMessage,
      })
    }
  }
}
