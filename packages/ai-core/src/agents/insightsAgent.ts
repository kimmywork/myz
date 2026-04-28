import type {
  AIModelSetting,
  AIProviderSetting,
  MaxOutputTokenParam,
} from "../settings"
import { normalizeMessagePayload } from "../normalize/message"
import { PromptBuilder } from "../prompt/builder"
import { injectSystemPromptAsUserMessage } from "../prompt/systemPrompt"
import type {
  ChatCompletionClient,
  ProviderChatCompletionRequest,
} from "../providers/types"
import type { ContextChunk, PageInsightPayload } from "../types"

export interface InsightsAgentDeps {
  client: ChatCompletionClient
}

export class InsightsAgent {
  private deps: InsightsAgentDeps

  constructor(deps: InsightsAgentDeps) {
    this.deps = deps
  }

  private buildInsightsPrompt(
    action: string,
    { totalGroups = 1 } = {},
  ): string {
    const actionLabel =
      action === "key_points" ? "发现关键要点" : "总结页面内容"
    const multiPartHint =
      totalGroups > 1
        ? `你会在多批（共 ${totalGroups} 批）中收到片段。编号必须跨批延续，并保持 MECE。`
        : "所有片段一次提供，请按金字塔结构组织。"
    return [
      "使用中文，输出 Markdown 的结构化总结。",
      multiPartHint,
      "要求：",
      "1) 结论在前，层级清晰，MECE。",
      "2) 关键要点必须引用原文。",
      '3) 引用格式：`[摘要内容](myz-chunk://{CHUNK_ID} "{原文文本前缀}")`，前缀≤80字且与原文一致。',
      `4) 当前任务：${actionLabel}。`,
      "5) 只有完全输出完毕时才以 [[END]] 结尾。",
      "示例：",
      '[观点](myz-chunk://xyz "原文前缀") ...',
    ].join("\n")
  }

  private normalizeInsightChunks(
    chunks: Partial<ContextChunk>[] = [],
    maxChunks = Infinity,
  ): ContextChunk[] {
    if (!Array.isArray(chunks)) {
      return []
    }
    const filtered = chunks.filter(
      (chunk) =>
        chunk &&
        typeof chunk.id !== "undefined" &&
        typeof chunk.text === "string" &&
        chunk.text.trim(),
    )
    const limit = Number.isFinite(maxChunks) ? maxChunks : filtered.length
    return filtered.slice(0, Math.max(1, limit)).map((chunk, index) => {
      const safeText =
        typeof chunk.text === "string" ? chunk.text : String(chunk.text || "")
      const prefix = (chunk.prefix || safeText.slice(0, 160)).replace(
        /\s+/g,
        " ",
      )
      return {
        id: String(chunk.id),
        order: index,
        text: safeText,
        prefix: prefix.trim(),
      }
    })
  }

  private splitChunksIntoGroups(
    chunks: ContextChunk[],
    perGroup = 20,
    maxCharsPerGroup = Infinity,
  ) {
    if (!Array.isArray(chunks) || !chunks.length) {
      return []
    }
    const limitCount = Math.max(1, Number(perGroup) || 20)
    const groups: ContextChunk[][] = []
    let current: ContextChunk[] = []
    let currentChars = 0

    const flush = () => {
      if (!current.length) {
        return
      }
      groups.push(current)
      current = []
      currentChars = 0
    }

    chunks.forEach((chunk) => {
      const text = typeof chunk.text === "string" ? chunk.text : ""
      const chunkChars = text.length
      if (
        current.length &&
        (current.length >= limitCount ||
          currentChars + chunkChars > maxCharsPerGroup)
      ) {
        flush()
      }
      current.push(chunk)
      currentChars += chunkChars
    })

    flush()
    return groups
  }

  async generatePageInsights(payload: Partial<PageInsightPayload> = {}) {
    throw new Error(
      "InsightsAgent.generatePageInsights must be called with run config",
    )
  }

  async generatePageInsightsWithConfig(
    payload: Partial<PageInsightPayload> = {},
    deps: {
      isEnabled: boolean
      callConfig: {
        provider: AIProviderSetting
        model: AIModelSetting
        temperature: number
      }
    },
  ) {
    if (!deps.isEnabled) {
      throw new Error("AI Assistant is not enabled")
    }
    const action = payload.action === "key_points" ? "key_points" : "summarize"
    const chunks = this.normalizeInsightChunks(payload.chunks || [], Infinity)
    if (!chunks.length) {
      throw new Error("No page context available to summarize")
    }

    const maxOutputTokens = deps.callConfig.model.limits.maxOutputTokens
    const maxOutputTokenParam: MaxOutputTokenParam =
      deps.callConfig.model.limits.maxOutputTokenParam
    const approximateCharsPerToken = 4
    const targetCharsPerBatch = Math.min(
      80000,
      Math.max(
        4000,
        Math.floor((maxOutputTokens / 2) * approximateCharsPerToken),
      ),
    )
    const chunkGroups = [
      ...this.splitChunksIntoGroups(chunks, chunks.length, targetCharsPerBatch),
    ]

    const prompt = new PromptBuilder()
      .addSystem(
        this.buildInsightsPrompt(action, {
          totalGroups: chunkGroups.length,
        }),
      )
      .addUser(
        [
          `页面标题: ${payload.title || "未命名页面"}`,
          `URL: ${payload.url || ""}`,
          `任务: ${action === "key_points" ? "提取关键要点" : "总结页面内容"}`,
          "请一次性阅读以下全部片段，按照指引输出 Markdown，并在全部完成后以 [[END]] 结尾。",
        ].join("\n"),
      )

    let chunkCounter = 0
    chunkGroups.forEach((group) => {
      group.forEach((chunk) => {
        prompt.addUser(
          [`CHUNK ${chunkCounter + 1}: ${chunk.id}`, "正文:", chunk.text].join(
            "\n",
          ),
        )
        chunkCounter += 1
      })
    })

    const conversationMessages = injectSystemPromptAsUserMessage(
      prompt.build(),
      Boolean(deps.callConfig.model?.systemPromptInUserMessage),
    )
    const markdownParts = []
    const rawResponses = []
    let attempts = 0
    const maxAttempts = 6

    const model = deps.callConfig.model.model

    while (attempts < maxAttempts) {
      const request: ProviderChatCompletionRequest = {
        model,
        messages:
          conversationMessages as ProviderChatCompletionRequest["messages"],
        temperature:
          typeof payload.temperature === "number"
            ? payload.temperature
            : deps.callConfig.temperature,
      }
      if (maxOutputTokenParam === "max_completion_tokens") {
        request.max_completion_tokens = maxOutputTokens
      } else {
        request.max_tokens = maxOutputTokens
      }

      const response = await this.deps.client.createCompletion(request, {
        enableReasoning: Boolean(
          deps.callConfig.model.capabilities.reasoning,
        ),
        enableGeminiThinking: Boolean(
          deps.callConfig.model.capabilities.reasoning,
        ),
      })

      const normalizedResponse = normalizeMessagePayload(
        response?.choices?.[0]?.message,
      )
      let content = (normalizedResponse.content || "").trim()
      const done = content.endsWith("[[END]]")
      if (done) {
        content = content.slice(0, -5).trimEnd()
      }
      if (content) {
        markdownParts.push(content)
      }
      rawResponses.push(content)

      if (done) {
        break
      }

      if (content) {
        conversationMessages.push({ role: "assistant", content })
      }
      conversationMessages.push({
        role: "user",
        content:
          "请继续尚未输出的内容，延续上一条的编号，并在全部完成后以 [[END]] 结尾。",
      })
      attempts += 1
    }

    return {
      success: true,
      action,
      markdown: markdownParts.join("\n\n").trim(),
      raw: rawResponses,
      chunkGroups: chunkGroups.length,
      generatedAt: new Date().toISOString(),
    }
  }
}
