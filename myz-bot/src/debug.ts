import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import type { ProviderRequestDebugRecord } from "@myz/ai-core/providers/types"
import type { BotRuntimeConfig } from "./config"

let lastTimestampLabel = ""
let sameTimestampCount = 0

function buildTimestampFileName(date = new Date()) {
  const label = date.toISOString().replace(/[:.]/g, "-")
  if (label === lastTimestampLabel) {
    sameTimestampCount += 1
  } else {
    lastTimestampLabel = label
    sameTimestampCount = 0
  }
  return `${label}-${String(sameTimestampCount).padStart(3, "0")}.json`
}

export async function writeLlmRequestDebugLog(options: {
  config: Pick<BotRuntimeConfig, "debug" | "systemDir" | "ai">
  conversationId?: string
  record: ProviderRequestDebugRecord
}) {
  if (!options.config.debug) return
  try {
    const dir = resolve(options.config.systemDir, "debug", "llm")
    mkdirSync(dir, { recursive: true })
    const now = new Date()
    const file = resolve(dir, buildTimestampFileName(now))
    const payload = {
      loggedAt: now.toISOString(),
      conversationId: options.conversationId || "",
      provider: options.config.ai.provider,
      model: typeof options.record.body === "object" && options.record.body
        ? (options.record.body as { model?: unknown }).model || ""
        : "",
      endpoint: options.record.endpoint,
      transport: options.record.transport,
      requestBody: options.record.body,
    }
    writeFileSync(file, JSON.stringify(payload, null, 2))
  } catch {
    // Debug logging is best-effort only.
  }
}
