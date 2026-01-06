import type { AIAssistantSettings } from "../../settings.js"
import { resolveActiveProvider } from "./resolveProvider.js"
import { createAiSession, type AiSession } from "./session.js"
import { ConversationAgent } from "../agents/conversationAgent.js"
import { InsightsAgent } from "../agents/insightsAgent.js"

function normalizeServers(servers: any) {
  if (!Array.isArray(servers)) return []
  return [...servers]
    .map((server) => ({
      id: server?.id || "",
      name: server?.name || "",
      enabled: Boolean(server?.enabled),
      url: server?.url || "",
      headers: server?.headers || undefined,
    }))
    .sort((a, b) => `${a.id}:${a.name}`.localeCompare(`${b.id}:${b.name}`))
}

function computeSessionKey(
  settings: AIAssistantSettings,
  options: { allowUntested?: boolean } = {},
) {
  const allowUntested = Boolean(options.allowUntested)
  const resolved = resolveActiveProvider(settings, { allowUntested })
  const provider = resolved.provider

  return JSON.stringify({
    allowUntested,
    enabled: Boolean(settings.aiAssistantEnabled),
    provider: provider
      ? {
          id: provider.id,
          apiEndpoint: provider.apiEndpoint,
          apiKey: provider.apiKey,
          model: provider.model,
          customModel: provider.customModel,
          requestHeaders: provider.requestHeaders,
          maxTokens: provider.maxTokens,
          contextSize: provider.contextSize,
          lastOk: Boolean(provider.lastTestStatus?.ok),
        }
      : null,
    mcp: normalizeServers(settings.aiMcpServers),
  })
}

export interface AiRuntime {
  key: string
  session: AiSession
  conversation: ConversationAgent
  insights: InsightsAgent
  acquireCount: number
  connectMcp: () => Promise<void>
  disconnectMcp: () => Promise<void>
  release: () => Promise<void>
}

const runtimes = new Map<string, AiRuntime>()

export async function acquireAiRuntime(
  settings: AIAssistantSettings,
  options: { allowUntested?: boolean } = {},
): Promise<AiRuntime> {
  const key = computeSessionKey(settings, options)
  const existing = runtimes.get(key)
  if (existing) {
    existing.acquireCount += 1
    return existing
  }

  const session = createAiSession(settings, options)
  const conversation = new ConversationAgent({
    isEnabled: session.isEnabled,
    settings: session.settings,
    client: session.clientWithTools,
  })
  const insights = new InsightsAgent({
    isEnabled: session.isEnabled,
    settings: {
      aiMaxTokens: session.settings.aiMaxTokens,
      aiModel: session.settings.aiModel,
      aiCustomModel: session.settings.aiCustomModel,
    },
    client: session.client,
  })

  let mcpRefCount = 0
  let connectPromise: Promise<void> | null = null
  let disconnectPromise: Promise<void> | null = null

  const runtime: AiRuntime = {
    key,
    session,
    conversation,
    insights,
    acquireCount: 1,
    async connectMcp() {
      mcpRefCount += 1
      if (mcpRefCount === 1) {
        disconnectPromise = null
        if (!connectPromise) {
          connectPromise = session.connectMcp().finally(() => {
            connectPromise = null
          })
        }
      }
      await (connectPromise || Promise.resolve())
    },
    async disconnectMcp() {
      mcpRefCount = Math.max(0, mcpRefCount - 1)
      if (mcpRefCount === 0) {
        connectPromise = null
        if (!disconnectPromise) {
          disconnectPromise = session.disconnectMcp().finally(() => {
            disconnectPromise = null
          })
        }
      }
      await (disconnectPromise || Promise.resolve())
    },
    async release() {
      runtime.acquireCount = Math.max(0, runtime.acquireCount - 1)
      if (runtime.acquireCount > 0) {
        return
      }
      try {
        await runtime.disconnectMcp()
      } finally {
        runtimes.delete(key)
      }
    },
  }

  runtimes.set(key, runtime)
  return runtime
}
