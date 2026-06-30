import { isRecord } from "@myz/shared/typeUtils"
import type { AIProviderSetting, McpServerSetting } from "../settings"
import {
  createProviderSession,
  type ProviderSession,
} from "./providerSession"

function normalizeServers(servers: unknown): McpServerSetting[] {
  if (!Array.isArray(servers)) return []
  return [...servers]
    .map((server) => (isRecord(server) ? server : {}))
    .map((server) => {
      const headers = isRecord(server.headers)
        ? Object.entries(server.headers).reduce<Record<string, string>>(
            (acc, [key, value]) => {
              if (typeof value === "string") {
                acc[key] = value
              }
              return acc
            },
            {},
          )
        : undefined
      return {
        id: typeof server.id === "string" ? server.id : "",
        name: typeof server.name === "string" ? server.name : "",
        enabled: Boolean(server.enabled),
        url: typeof server.url === "string" ? server.url : "",
        headers,
      }
    })
    .sort((a, b) => `${a.id}:${a.name}`.localeCompare(`${b.id}:${b.name}`))
}

function computeProviderKey(
  provider: AIProviderSetting,
  servers: McpServerSetting[],
) {
  return JSON.stringify({
    provider: {
      id: provider.id,
      name: provider.name,
      type: provider.type,
      enabled: Boolean(provider.enabled),
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      headers: provider.headers,
      lastTestOk: Boolean(provider.lastTest?.ok),
      lastTestModel: provider.lastTest?.model || "",
    },
    mcp: normalizeServers(servers),
  })
}

export interface ProviderRuntime {
  key: string
  session: ProviderSession
  acquireCount: number
  connectMcp: () => Promise<void>
  disconnectMcp: () => Promise<void>
  release: () => Promise<void>
}

const runtimes = new Map<string, ProviderRuntime>()

export async function acquireProviderRuntime(
  provider: AIProviderSetting,
  mcpServers: McpServerSetting[] = [],
): Promise<ProviderRuntime> {
  const key = computeProviderKey(provider, mcpServers)
  const existing = runtimes.get(key)
  if (existing) {
    existing.acquireCount += 1
    return existing
  }

  const session = createProviderSession(provider, mcpServers)

  let mcpRefCount = 0
  let connectPromise: Promise<void> | null = null
  let disconnectPromise: Promise<void> | null = null

  const runtime: ProviderRuntime = {
    key,
    session,
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
