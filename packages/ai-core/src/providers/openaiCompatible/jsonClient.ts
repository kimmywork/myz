import type {
  ChatCompletionClient,
  ProviderChatCompletionRequest,
  ProviderChatCompletionResponse,
  ProviderStreamOptions,
} from "../types"
import { emitProviderRequestDebug } from "../debug"

type ValueOrGetter<T> = T | (() => T)

function resolveValue<T>(value: ValueOrGetter<T>): T {
  return typeof value === "function" ? (value as () => T)() : value
}

export interface OpenAICompatibleJsonClientOptions {
  endpoint: ValueOrGetter<string>
  buildHeaders: ValueOrGetter<Record<string, string>>
  syncHeaders?: () => Promise<void>
}

export class OpenAICompatibleJsonClient implements ChatCompletionClient {
  private endpoint: ValueOrGetter<string>
  private buildHeaders: ValueOrGetter<Record<string, string>>
  private syncHeaders?: () => Promise<void>

  constructor(options: OpenAICompatibleJsonClientOptions) {
    this.endpoint = options.endpoint
    this.buildHeaders = options.buildHeaders
    this.syncHeaders = options.syncHeaders
  }

  async createCompletion(
    request: ProviderChatCompletionRequest,
    options: ProviderStreamOptions = {},
  ): Promise<ProviderChatCompletionResponse> {
    await this.syncHeaders?.()

    const endpoint = resolveValue(this.endpoint)
    if (!endpoint) {
      throw new Error("API endpoint not configured")
    }

    const normalizedRequest = {
      ...request,
      messages: shouldUseDeveloperRole(request?.model)
        ? request.messages.map((message) =>
            message.role === "system"
              ? { ...message, role: "developer" }
              : message,
          )
        : request.messages,
    }

    const payload = {
      ...normalizedRequest,
      stream: false,
    }
    await emitProviderRequestDebug(options, {
      endpoint,
      transport: "json",
      body: payload,
    })

    const response = await fetch(endpoint, {
      method: "POST",
      headers: resolveValue(this.buildHeaders),
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `API request failed: ${response.status} ${response.statusText} - ${errorText}`,
      )
    }

    return (await response.json()) as ProviderChatCompletionResponse
  }
}

export function shouldUseDeveloperRole(model: unknown): boolean {
  const raw = typeof model === "string" ? model.trim().toLowerCase() : ""
  if (!raw.startsWith("gpt-")) return false
  if (raw.startsWith("gpt-o1")) return true
  const rest = raw.slice(4)
  const digitMatch = rest.match(/\d/)
  if (!digitMatch) return false
  const digit = Number(digitMatch[0])
  if (!Number.isFinite(digit)) return false
  return digit >= 4
}
