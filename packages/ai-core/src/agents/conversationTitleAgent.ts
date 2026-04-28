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

export interface ConversationTitleAgentDeps {
  client: ChatCompletionClient
}

export class ConversationTitleAgent {
  private deps: ConversationTitleAgentDeps

  constructor(deps: ConversationTitleAgentDeps) {
    this.deps = deps
  }

  private buildSystemPrompt() {
    return [
      "你是对话标题生成助手。",
      "请基于用户的原始请求生成一个简短标题。",
      "要求：",
      "1) 仅输出标题，不要引号或额外说明。",
      "2) 标题尽量短（<= 18 个汉字或 6-10 个英文词）。",
      "3) 避免包含日期或冗余前缀。",
    ].join("\n")
  }

  private normalizeTitle(value: string) {
    if (!value) return ""
    let text = value.trim()
    text = text.replace(/^["'“”]+|["'“”]+$/g, "")
    text = text.split(/\r?\n/)[0]?.trim() || ""
    if (!text) return ""
    const maxLen = 36
    return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text
  }

  async generateTitleWithConfig(
    payload: { request: string; pageTitle?: string; url?: string },
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

    const requestText =
      typeof payload?.request === "string" ? payload.request.trim() : ""
    if (!requestText) return ""

    const prompt = new PromptBuilder()
      .addSystem(this.buildSystemPrompt())
      .addUser(
        [
          payload?.pageTitle ? `页面标题: ${payload.pageTitle}` : "",
          payload?.url ? `URL: ${payload.url}` : "",
          `用户原始请求: ${requestText}`,
        ]
          .filter(Boolean)
          .join("\n"),
      )

    const conversationMessages = injectSystemPromptAsUserMessage(
      prompt.build(),
      Boolean(deps.callConfig.model?.systemPromptInUserMessage),
    )

    const maxOutputTokens = Math.min(
      64,
      deps.callConfig.model.limits.maxOutputTokens,
    )
    const maxOutputTokenParam: MaxOutputTokenParam =
      deps.callConfig.model.limits.maxOutputTokenParam
    const model = deps.callConfig.model.model

    const request: ProviderChatCompletionRequest = {
      model,
      messages:
        conversationMessages as ProviderChatCompletionRequest["messages"],
      temperature: 0.3,
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
    const { content } = normalizeMessagePayload(
      response?.choices?.[0]?.message,
    )
    return this.normalizeTitle(content || "")
  }
}
