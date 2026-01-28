import type {
  ChatCompletionClient,
  ProviderChatCompletionRequest,
  ProviderChatCompletionResponse,
  ProviderStreamOptions,
} from "../types.js"

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
    _options: ProviderStreamOptions = {},
  ): Promise<ProviderChatCompletionResponse> {
    await this.syncHeaders?.()

    const endpoint = resolveValue(this.endpoint)
    if (!endpoint) {
      throw new Error("API endpoint not configured")
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: resolveValue(this.buildHeaders),
      body: JSON.stringify({
        ...request,
        stream: false,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `API request failed: ${response.status} ${response.statusText} - ${errorText}`,
      )
    }

    return response.json()
  }
}

