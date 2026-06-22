import { readFileSync, existsSync, realpathSync } from "node:fs"
import { homedir } from "node:os"
import { resolve } from "node:path"
import { createHash } from "node:crypto"
import dotenv from "dotenv"
import yaml from "yaml"

dotenv.config({ path: resolve(process.cwd(), ".env") })

export const RUNTIME_DIRNAME = ".myz"

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const r = { ...target }
  for (const k of Object.keys(source)) {
    if (isPlainObject(r[k]) && isPlainObject(source[k])) {
      r[k] = deepMerge(r[k] as Record<string, unknown>, source[k] as Record<string, unknown>)
    } else if (source[k] !== undefined) {
      r[k] = source[k]
    }
  }
  return r
}

function resolveEnvVars(value: unknown): unknown {
  if (typeof value !== "string") return value
  return value.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] || "")
}

function resolveEnvVarsDeep(obj: unknown): unknown {
  if (typeof obj === "string") return resolveEnvVars(obj)
  if (Array.isArray(obj)) return obj.map(resolveEnvVarsDeep)
  if (isPlainObject(obj)) {
    const r: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) r[k] = resolveEnvVarsDeep(v)
    return r
  }
  return obj
}

// --- Provider / Model registry ---

export interface ModelConfig {
  id: string
  contextWindow: number
  maxOutputTokens: number
  capabilities: {
    toolCalling: boolean
    reasoning: boolean
    vision: boolean
  }
}

export interface ProviderConfig {
  type: string
  baseUrl: string
  apiKey: string
  compatProfile?: string
  models: ModelConfig[]
}

export interface PermissionRule {
  pattern: string
  action: "allow" | "ask" | "deny"
}

export interface ContextConfig {
  strategy: "summary" | "token-budget" | "none"
  summaryThresholdRatio: number
  recentWindowRatio: number
  summaryMaxTokens: number
}

export interface BrowserConfig {
  enabled: boolean
  headless: boolean
}

export interface SkillsConfig {
  allowlist: string[]
  denylist: string[]
}

// --- Global config (~/.myz/myz.yml) ---

export interface GlobalConfig {
  providers: Record<string, ProviderConfig>
  defaults: {
    provider: string
    model: string
  }
}

// --- Workspace config (.agents/myz.yml) ---

export interface WorkspaceConfig {
  defaults?: {
    provider?: string
    model?: string
  }
  permissions?: PermissionRule[]
  skills?: SkillsConfig
  browser?: BrowserConfig
  context?: ContextConfig
}

// --- Merged runtime config ---

export interface AgentConfig {
  runtimeRoot: string
  workspaceRoot: string
  workspaceId: string

  providers: Record<string, ProviderConfig>
  defaults: { provider: string; model: string }
  permissions: PermissionRule[]
  skills: SkillsConfig
  browser: BrowserConfig
  context: ContextConfig

  sessionsDir: string
  attachmentsDir: string
}

function normalizeWorkspaceRoot(workspaceRoot = process.cwd()) {
  const absolute = resolve(workspaceRoot)
  if (!existsSync(absolute)) throw new Error(`workspace not found: ${absolute}`)
  try { return realpathSync(absolute) } catch { return absolute }
}

function buildWorkspaceId(workspaceRoot: string) {
  return createHash("sha256").update(workspaceRoot).digest("hex").slice(0, 16)
}

export function resolveRuntimeRoot(home = homedir()) {
  return resolve(home, RUNTIME_DIRNAME)
}

function loadYaml(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {}
  try {
    return yaml.parse(readFileSync(path, "utf-8")) || {}
  } catch (e) {
    throw new Error(`Failed to parse ${path}: ${(e as Error).message}`)
  }
}

function parseGlobalConfig(raw: Record<string, unknown>): GlobalConfig {
  const providers: Record<string, ProviderConfig> = {}
  const rawProviders = isPlainObject(raw.providers) ? raw.providers : {}

  for (const [id, p] of Object.entries(rawProviders)) {
    if (!isPlainObject(p)) continue
    providers[id] = {
      type: String(p.type || "openai_compatible"),
      baseUrl: String(p.baseUrl || ""),
      apiKey: String(p.apiKey || ""),
      compatProfile: typeof p.compatProfile === "string" ? p.compatProfile : undefined,
      models: Array.isArray(p.models)
        ? p.models.filter(isPlainObject).map((m: any) => ({
            id: String(m.id || ""),
            contextWindow: Number(m.contextWindow) || 8192,
            maxOutputTokens: Number(m.maxOutputTokens) || 4096,
            capabilities: {
              toolCalling: m.capabilities?.toolCalling !== false,
              reasoning: Boolean(m.capabilities?.reasoning),
              vision: Boolean(m.capabilities?.vision),
            },
          }))
        : [],
    }
  }

  const defaults = isPlainObject(raw.defaults) ? raw.defaults : {}

  return {
    providers,
    defaults: {
      provider: String(defaults.provider || ""),
      model: String(defaults.model || ""),
    },
  }
}

function parseWorkspaceConfig(raw: Record<string, unknown>): WorkspaceConfig {
  const config: WorkspaceConfig = {}
  if (isPlainObject(raw.defaults)) {
    config.defaults = {
      provider: typeof raw.defaults.provider === "string" ? raw.defaults.provider : undefined,
      model: typeof raw.defaults.model === "string" ? raw.defaults.model : undefined,
    }
  }
  if (Array.isArray(raw.permissions)) {
    config.permissions = raw.permissions
      .filter(isPlainObject)
      .map((r: any) => ({ pattern: String(r.pattern || ""), action: String(r.action || "allow") as PermissionRule["action"] }))
      .filter((r) => r.pattern)
  }
  if (isPlainObject(raw.skills)) {
    config.skills = {
      allowlist: Array.isArray(raw.skills.allowlist) ? raw.skills.allowlist.map(String) : [],
      denylist: Array.isArray(raw.skills.denylist) ? raw.skills.denylist.map(String) : [],
    }
  }
  if (isPlainObject(raw.browser)) {
    config.browser = {
      enabled: raw.browser.enabled !== false,
      headless: raw.browser.headless !== false,
    }
  }
  if (isPlainObject(raw.context)) {
    config.context = {
      strategy: (["summary", "token-budget", "none"].includes(String(raw.context.strategy)) ? raw.context.strategy : "summary") as ContextConfig["strategy"],
      summaryThresholdRatio: Number(raw.context.summaryThresholdRatio) || 0.8,
      recentWindowRatio: Number(raw.context.recentWindowRatio) || 0.3,
      summaryMaxTokens: Number(raw.context.summaryMaxTokens) || 2000,
    }
  }
  return config
}

function loadConfigBase(options: {
  workspaceRoot?: string
  runtimeRoot?: string
} = {}): AgentConfig {
  const runtimeRoot = resolve(options.runtimeRoot || resolveRuntimeRoot())
  const workspaceRoot = normalizeWorkspaceRoot(options.workspaceRoot)

  // Load configs
  const globalRaw = loadYaml(resolve(runtimeRoot, "myz.yml"))
  const workspaceRaw = loadYaml(resolve(workspaceRoot, ".agents", "myz.yml"))

  // Parse
  const global = parseGlobalConfig(globalRaw)
  const workspace = parseWorkspaceConfig(workspaceRaw)

  // Merge defaults (workspace overrides global)
  const providers = resolveEnvVarsDeep(global.providers) as Record<string, ProviderConfig>
  const defaults = {
    provider: workspace.defaults?.provider || global.defaults.provider,
    model: workspace.defaults?.model || global.defaults.model,
  }

  const workspaceId = buildWorkspaceId(workspaceRoot)

  return {
    runtimeRoot,
    workspaceRoot,
    workspaceId,
    providers,
    defaults,
    permissions: workspace.permissions || [],
    skills: workspace.skills || { allowlist: [], denylist: [] },
    browser: workspace.browser || { enabled: true, headless: true },
    context: workspace.context || {
      strategy: "summary",
      summaryThresholdRatio: 0.8,
      recentWindowRatio: 0.3,
      summaryMaxTokens: 2000,
    },
    sessionsDir: resolve(runtimeRoot, "workspaces", workspaceId, "sessions"),
    attachmentsDir: resolve(runtimeRoot, "workspaces", workspaceId, "attachments"),
  }
}

export function resolveModelConfig(
  config: AgentConfig,
  providerId?: string,
  modelId?: string,
): { provider: ProviderConfig; model: ModelConfig } | null {
  const pid = providerId || config.defaults.provider
  const mid = modelId || config.defaults.model
  if (!pid || !mid) return null
  const provider = config.providers[pid]
  if (!provider) return null
  const model = provider.models.find((m) => m.id === mid)
  if (!model) return null
  return { provider, model }
}

/** Clean config loader returning AgentConfig (no compat shim) */
export function loadConfigNew(options: { workspaceRoot?: string; runtimeRoot?: string } = {}): AgentConfig {
  return loadConfigBase(options)
}

// --- Compatibility shim (deprecated, migrate to AgentConfig) ---

/** @deprecated Use AgentConfig with loadConfigNew */
export type BotRuntimeConfig = AgentConfig & {
  ai: {
    provider: string
    model: string
    baseUrl: string
    accessToken: string
    headers: Record<string, string>
    compatProfile: "auto" | "deepseek" | "moonshot" | "glm" | "qwen" | "minimax" | "longcat" | "mimo" | "custom"
    streamingEnabled: boolean
    systemPromptInUserMessage: boolean
    retry: { retries: number; baseDelayMs: number }
    capabilities: { toolCalling: boolean; reasoning: boolean; vision: boolean; imageOutput: boolean }
    limits: { contextWindow: number; maxOutputTokens: number; maxOutputTokenParam: "max_tokens" | "max_completion_tokens" }
    tooling: any
    reasoningMode: "provider_default" | "enabled" | "disabled"
    reasoningEffort: "provider_default" | "low" | "medium" | "high"
    reasoningBudget?: number
  }
  channels: { tui: { enabled: boolean; label: string; operatorUsername: string; operatorFirstName: string; operatorLastName: string } }
  network: { requestTimeoutMs: number; connectTimeoutMs: number; proxyUrl: string }
  contextCompaction: { enabled: boolean; maxHistoryMessages: number; maxHistoryChars: number; summaryMaxMessages: number; summaryMaxChars: number; compressionCooldownMs: number }
  mcpServers: any[]
  debug: boolean
  workspaceRuntimeRoot: string
  skillsDir: string
  attachmentsDir: string
  sessionsDir: string
  historyDir: string
  permissionsDir: string
  soulRuntimeDir: string
  systemDir: string
  memoryDir: string
  knowledgeDir: string
  skillSources: any[]
  skillAllowlist: string[]
  skillDenylist: string[]
  toolAllowlist: string[]
  toolDenylist: string[]
  scheduler: any
  soul: any
  access: any
  browser: any
}

/** @deprecated Use loadConfigNew (returns AgentConfig) */
export function loadConfig(options: { workspaceRoot?: string; runtimeRoot?: string } = {}): BotRuntimeConfig {
  const config = loadConfigBase(options)
  const resolved = resolveModelConfig(config)
  return {
    ...config,
    ai: {
      provider: config.defaults.provider,
      model: config.defaults.model,
      baseUrl: resolved?.provider.baseUrl || "",
      accessToken: resolved?.provider.apiKey || "",
      headers: {},
      compatProfile: (resolved?.provider.compatProfile || "auto") as any,
      streamingEnabled: true,
      systemPromptInUserMessage: false,
      retry: { retries: 2, baseDelayMs: 1000 },
      capabilities: { ...resolved?.model.capabilities, imageOutput: false } as any,
      limits: {
        contextWindow: resolved?.model.contextWindow || 8192,
        maxOutputTokens: resolved?.model.maxOutputTokens || 4096,
        maxOutputTokenParam: "max_tokens" as const,
      },
      tooling: { toolChoice: "auto", strict: "auto", parallelToolCalls: "auto" },
      reasoningMode: "provider_default" as const,
      reasoningEffort: "provider_default" as const,
    },
    channels: { tui: { enabled: true, label: "local", operatorUsername: "local", operatorFirstName: "Local", operatorLastName: "Operator" } },
    network: { requestTimeoutMs: 180000, connectTimeoutMs: 10000, proxyUrl: "" },
    contextCompaction: { enabled: true, maxHistoryMessages: 120, maxHistoryChars: 120000, summaryMaxMessages: 20, summaryMaxChars: 6000, compressionCooldownMs: 300000 },
    mcpServers: [],
    debug: false,
    workspaceRuntimeRoot: config.sessionsDir.replace("/sessions", ""),
    skillsDir: resolve(config.workspaceRoot, "skills"),
    attachmentsDir: config.attachmentsDir,
    sessionsDir: config.sessionsDir,
    historyDir: config.sessionsDir.replace("/sessions", "/history"),
    permissionsDir: config.sessionsDir.replace("/sessions", "/permissions"),
    soulRuntimeDir: config.sessionsDir.replace("/sessions", "/soul"),
    systemDir: config.sessionsDir.replace("/sessions", "/system"),
    memoryDir: resolve(config.workspaceRoot, "memory"),
    knowledgeDir: resolve(config.workspaceRoot, "knowledge"),
    skillSources: [],
    skillAllowlist: config.skills.allowlist,
    skillDenylist: config.skills.denylist,
    toolAllowlist: [],
    toolDenylist: [],
    scheduler: { enabled: true, pollIntervalMs: 15000, maxBatchSize: 20, failureRetryBaseDelayMs: 60000 },
    soul: { reviewRequired: true },
    access: { allowedPaths: [], blockedPaths: [], allowedCommands: [], blockedCommands: [] },
    browser: config.browser,
  }
}
