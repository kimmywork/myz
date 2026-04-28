import OpenAI from "openai"
import type { ProviderStreamOptions } from "../types"
import { emitProviderRequestDebug } from "../debug"
import { buildProviderHeaders } from "../../runtime/openaiCompatible"

function stringifyEndpoint(input: string | URL | Request) {
  if (typeof input === "string") return input
  if (input instanceof URL) return input.toString()
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.url
  }
  return String(input)
}

function parseDebugBody(body: unknown) {
  if (typeof body !== "string") {
    return typeof body === "undefined" ? null : body
  }
  try {
    return JSON.parse(body)
  } catch {
    return body
  }
}

class BrowserOpenAI extends OpenAI {
  protected override validateHeaders() {
    return
  }

  protected override async authHeaders() {
    return undefined
  }
}

export function createOpenAISdkClient(options: {
  baseURL: string
  apiKey: string
  headers: string
  requestOptions?: ProviderStreamOptions
}) {
  return new BrowserOpenAI({
    apiKey: options.apiKey || "myz-openai-compatible-placeholder",
    baseURL: options.baseURL,
    defaultHeaders: buildProviderHeaders(options.apiKey, options.headers || ""),
    dangerouslyAllowBrowser: true,
    fetch: async (input: string | URL | Request, init?: RequestInit) => {
      const body = parseDebugBody(init?.body)
      await emitProviderRequestDebug(options.requestOptions, {
        endpoint: stringifyEndpoint(input),
        transport:
          body &&
          typeof body === "object" &&
          "stream" in (body as Record<string, unknown>) &&
          (body as Record<string, unknown>).stream === true
            ? "sse"
            : "json",
        body,
      })
      return fetch(input, init)
    },
  })
}
