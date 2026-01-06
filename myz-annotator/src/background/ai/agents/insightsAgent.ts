import type { ChatCompletionClient } from "../providers/types.js"
import type { ContextChunk, PageInsightPayload } from "../types.js"
import { normalizeMessagePayload } from "../normalize/message.js"
import { PromptBuilder } from "../prompt/builder.js"
import type { AIModelSetting, AIProviderSetting, MaxOutputTokenParam } from "../../settings.js"

export interface InsightsAgentDeps {
  client: ChatCompletionClient
}

export class InsightsAgent {
  private deps: InsightsAgentDeps

  constructor(deps: InsightsAgentDeps) {
    this.deps = deps
  }

  private buildInsightsPrompt(action: string, { totalGroups = 1 } = {}): string {
    const actionLabel = action === "key_points" ? "发现关键要点" : "总结页面内容"
    const multiPartHint =
      totalGroups > 1
        ? `你会在多批（共 ${totalGroups} 批）中收到片段。编号必须跨批延续，并保持 MECE。`
        : "所有片段一次提供，请按照金字塔结构（结论在前，层级清晰）组织。"
    return [
      "请使用中文回答，并以 Markdown 呈现网页的结构化总结。",
      multiPartHint,
      "要求：",
      "1. 使用 Markdown 清晰准确地总结内容，确保信息完整且无歧义。",
      "2. 按照金字塔原理，顶层先给全局结论，再给分层要点，结论准确，层级清晰。各层级须符合MECE准则。",
      '3. 涉及到对于原文引用的信息，请使用 `[摘要内容](myz-chunk://{CHUNK_ID} "{原文文本前缀}")` 的形式引用，旨在生成链接以方便用户定位原文。其中 `myz-chunk://` 协议部分是必需内容，`{CHUNK_ID}` 为对应引文的CHUNK ID，`{原文文本前缀}` 最长80字符，必须与原文一致。',
      "4. 所有关键要点必须给出原文引用。",
      `5. 当前任务：${actionLabel}。`,
      "6. 当且仅当所有内容完全输出完毕时，以 [[END]] 结尾；若尚未完成，请不要输出该终止符。",
      `
生成摘要的方式如下：
对于原文：

CHUNK 1: myz-chunk-miy0603t-000
正文:
古典自由主义（英语：classical liberalism）是一种支持个人先于国家存在的政治哲学，强调个人的权利、私有财产，并主张自由放任的经济政策，认为政府存在的目的仅在于保护每个个体的自由。古典自由主义发源于17世纪和18世纪，通常被视为由于工业革命和随后的资本主义体制而产生的一种意识形态。言论自由、信仰自由、思想自由和自由市场等概念最先也是由古典自由主义所提出，后来才陆续被其他政治意识形态所采纳。古典自由主义反对当时绝大多数较早期的政治学说，例如君权神授说、世袭制度和国教制度，强调个人的自由、理性、正义和宽容。美国革命和法国大革命都受到古典自由主义的影响。

生成的摘要可以是：

[古典自由主义](myz-chunk://myz-chunk-miy0603t-000 "古典自由主义（英语：classical liberalism）是一种支持个人先于国家存在的政治哲学")是一种[源于17至18世纪](myz-chunk://myz-chunk-miy0603t-000 "古典自由主义发源于17世纪和18世纪")、强调个人权利、私有财产和自由市场，并主张政府仅限于保护个体自由的政治哲学，[对美国和法国大革命产生了重要影响](myz-chunk://myz-chunk-miy0603t-000 "美国革命和法国大革命都受到古典自由主义的影响")。
`,
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
    throw new Error("InsightsAgent.generatePageInsights must be called with run config")
  }

  async generatePageInsightsWithConfig(
    payload: Partial<PageInsightPayload> = {},
    deps: {
      isEnabled: boolean
      callConfig: { provider: AIProviderSetting; model: AIModelSetting; temperature: number }
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

    const conversationMessages = prompt.build()
    const markdownParts = []
    const rawResponses = []
    let attempts = 0
    const maxAttempts = 6

    const model = deps.callConfig.model.model

    while (attempts < maxAttempts) {
      const request: any = {
        model,
        messages: conversationMessages as any,
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

      const response = await this.deps.client.createCompletion(request)

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
