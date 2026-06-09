import { readFileSync, existsSync, realpathSync } from "node:fs"
import { homedir } from "node:os"
import { resolve } from "node:path"
import { createHash } from "node:crypto"
import {
  AI_PROVIDER_TYPES,
  AI_REASONING_EFFORT_SETTINGS,
  AI_REASONING_MODES,
  OPENAI_COMPATIBLE_PROFILES,
} from "@myz/ai-core/settings"
import dotenv from "dotenv"
import { z } from "zod"
import yaml from "yaml"
import { getBuiltinSkillSource } from "./builtinSkills"
import type { SkillSource } from "./skills"

dotenv.config({ path: resolve(process.cwd(), ".env") })

export const BOT_RUNTIME_DIRNAME = ".myz-bot"

const TuiChannelConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  label: z.string().min(1).optional().default("local"),
  operatorUsername: z.string().min(1).optional().default("local"),
  operatorFirstName: z.string().min(1).optional().default("Local"),
  operatorLastName: z.string().optional().default("Operator"),
})

const ChannelsConfigSchema = z
  .object({
    tui: TuiChannelConfigSchema.optional().default({
      enabled: true,
      label: "local",
      operatorUsername: "local",
      operatorFirstName: "Local",
      operatorLastName: "Operator",
    }),
  })
  .catchall(z.unknown())
  .optional()
  .default({
    tui: {
      enabled: true,
      label: "local",
      operatorUsername: "local",
      operatorFirstName: "Local",
      operatorLastName: "Operator",
    },
  })

const SkillSourceConfigSchema = z.object({
  id: z.string().min(1),
  dir: z.string().min(1),
  readonly: z.boolean().optional().default(false),
})

const BotConfigSchema = z.object({
  channels: ChannelsConfigSchema,
  network: z
    .object({
      requestTimeoutMs: z.number().int().min(0).optional().default(180_000),
      connectTimeoutMs: z.number().int().positive().optional().default(10_000),
      keepAliveTimeoutMs: z.number().int().positive().optional().default(4_000),
      keepAliveTimeoutThresholdMs: z.number().int().min(0).optional().default(2_000),
      proxyUrl: z.string().optional().default(""),
    })
    .optional()
    .default({
      requestTimeoutMs: 180_000,
      connectTimeoutMs: 10_000,
      keepAliveTimeoutMs: 4_000,
      keepAliveTimeoutThresholdMs: 2_000,
      proxyUrl: "",
    }),
  ai: z.object({
    provider: z.enum(AI_PROVIDER_TYPES),
    baseUrl: z.string().optional().default(""),
    accessToken: z.string().optional().default(""),
    headers: z.record(z.string(), z.string()).default({}),
    compatProfile: z.enum(OPENAI_COMPATIBLE_PROFILES).optional().default("auto"),
    reasoningMode: z.enum(AI_REASONING_MODES).optional().default("provider_default"),
    reasoningEffort: z
      .enum(AI_REASONING_EFFORT_SETTINGS)
      .optional()
      .default("provider_default"),
    reasoningBudget: z.number().int().min(0).optional(),
    model: z.string().min(1),
    streamingEnabled: z.boolean().optional().default(true),
    systemPromptInUserMessage: z.boolean().optional().default(false),
    retry: z
      .object({
        retries: z.number().int().min(0).optional().default(2),
        baseDelayMs: z.number().int().min(0).optional().default(1000),
      })
      .optional()
      .default({
        retries: 2,
        baseDelayMs: 1000,
      }),
    capabilities: z
      .object({
        toolCalling: z.boolean().default(true),
        reasoning: z.boolean().default(false),
        vision: z.boolean().default(false),
        imageOutput: z.boolean().default(false),
      })
      .default({
        toolCalling: true,
        reasoning: false,
        vision: false,
        imageOutput: false,
      }),
    limits: z
      .object({
        contextWindow: z.number().int().positive().default(8192),
        maxOutputTokens: z.number().int().positive().default(1024),
        maxOutputTokenParam: z.enum(["max_tokens", "max_completion_tokens"]),
      })
      .default({
        contextWindow: 8192,
        maxOutputTokens: 1024,
        maxOutputTokenParam: "max_tokens",
      }),
    tooling: z
      .object({
        toolChoice: z.enum(["auto", "none", "required", "tool"]),
        strict: z.enum(["auto", "on", "off"]),
        parallelToolCalls: z.enum(["auto", "on", "off"]),
      })
      .default({
        toolChoice: "auto",
        strict: "auto",
        parallelToolCalls: "auto",
      }),
  }),
  contextCompaction: z
    .object({
      enabled: z.boolean().optional().default(true),
      maxHistoryMessages: z.number().int().positive().optional().default(120),
      maxHistoryChars: z.number().int().positive().optional().default(120_000),
      summaryMaxMessages: z.number().int().positive().optional().default(20),
      summaryMaxChars: z.number().int().positive().optional().default(6_000),
      compressionCooldownMs: z.number().int().min(0).optional().default(300_000),
    })
    .optional()
    .default({
      enabled: true,
      maxHistoryMessages: 120,
      maxHistoryChars: 120_000,
      summaryMaxMessages: 20,
      summaryMaxChars: 6_000,
      compressionCooldownMs: 300_000,
    }),
  mcpServers: z
    .array(
      z.object({
        id: z.string().optional().default(""),
        name: z.string().min(1),
        enabled: z.boolean().default(true),
        url: z.string().min(1),
        headers: z.record(z.string(), z.string()).optional(),
      }),
    )
    .optional()
    .default([]),
  skills: z
    .object({
      sources: z.array(SkillSourceConfigSchema).optional().default([]),
      allowlist: z.array(z.string().min(1)).optional().default([]),
      denylist: z.array(z.string().min(1)).optional().default([]),
    })
    .optional()
    .default({
      sources: [],
      allowlist: [],
      denylist: [],
    }),
  debug: z.boolean().optional().default(false),
  tools: z
    .object({
      allowlist: z.array(z.string().min(1)).optional().default([]),
      denylist: z.array(z.string().min(1)).optional().default([]),
    })
    .optional()
    .default({
      allowlist: [],
      denylist: [],
    }),
  scheduler: z
    .object({
      enabled: z.boolean().optional().default(true),
      pollIntervalMs: z.number().int().positive().optional().default(15_000),
      maxBatchSize: z.number().int().positive().optional().default(20),
      failureRetryBaseDelayMs: z.number().int().positive().optional().default(60_000),
    })
    .optional()
    .default({
      enabled: true,
      pollIntervalMs: 15_000,
      maxBatchSize: 20,
      failureRetryBaseDelayMs: 60_000,
    }),
  upgrade: z
    .object({
      enabled: z.boolean().optional().default(true),
      packageName: z.string().min(1).optional().default("myz-bot"),
      channel: z.string().min(1).optional().default("latest"),
      checkIntervalMs: z.number().int().positive().optional().default(21_600_000),
      strategy: z.enum(["notify", "prepare-and-restart"]).optional().default("notify"),
      applyMode: z.enum(["manual", "launcher-only"]).optional().default("manual"),
      allowPrerelease: z.boolean().optional().default(false),
    })
    .optional()
    .default({
      enabled: true,
      packageName: "myz-bot",
      channel: "latest",
      checkIntervalMs: 21_600_000,
      strategy: "notify",
      applyMode: "manual",
      allowPrerelease: false,
    }),
  soul: z
    .object({
      reviewRequired: z.boolean().optional().default(true),
    })
    .optional()
    .default({
      reviewRequired: true,
    }),
  browser: z
    .object({
      enabled: z.boolean().optional().default(true),
      headless: z.boolean().optional().default(true),
      timeoutMs: z.number().int().positive().optional().default(30_000),
      viewportWidth: z.number().int().positive().optional().default(1280),
      viewportHeight: z.number().int().positive().optional().default(720),
    })
    .optional()
    .default({
      enabled: true,
      headless: true,
      timeoutMs: 30_000,
      viewportWidth: 1280,
      viewportHeight: 720,
    }),
  knowledge: z
    .object({
      enabled: z.boolean().optional().default(true),
      appDataDir: z.string().optional().default(""),
      maxContextItems: z.number().int().positive().optional().default(8),
      autoIngest: z.boolean().optional().default(true),
      ingestIntervalMs: z.number().int().positive().optional().default(300_000),
      evictionDays: z.number().int().positive().optional().default(90),
      opsExpiryDays: z.number().int().positive().optional().default(30),
    })
    .optional()
    .default({
      enabled: true,
      appDataDir: "",
      maxContextItems: 8,
      autoIngest: true,
      ingestIntervalMs: 300_000,
      evictionDays: 90,
      opsExpiryDays: 30,
    }),
})

export type BotConfig = z.infer<typeof BotConfigSchema>
export interface SkillSourceConfig {
  id: string
  dir: string
  readonly?: boolean
}

export interface TuiChannelRuntimeConfig {
  enabled: boolean
  label: string
  operatorUsername: string
  operatorFirstName: string
  operatorLastName: string
}

export type BotRuntimeConfig = Omit<BotConfig, "channels"> & {
  channels: BotConfig["channels"] & {
    tui: TuiChannelRuntimeConfig
  }
  runtimeRoot: string
  workspaceRoot: string
  workspaceId: string
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
  skillSources: SkillSource[]
  skillAllowlist: string[]
  skillDenylist: string[]
  toolAllowlist: string[]
  toolDenylist: string[]
}

export function resolveRuntimeRoot(home = homedir()) {
  return resolve(home, BOT_RUNTIME_DIRNAME)
}

export function resolveConfigPath(runtimeRoot = resolveRuntimeRoot()) {
  return resolve(runtimeRoot, "bot.yml")
}

export function normalizeWorkspaceRoot(workspaceRoot = process.cwd()) {
  const absolute = resolve(workspaceRoot)
  if (!existsSync(absolute)) {
    throw new Error(`workspace not found: ${absolute}`)
  }
  try {
    return realpathSync(absolute)
  } catch {
    return absolute
  }
}

export function buildWorkspaceId(workspaceRoot: string) {
  return createHash("sha256").update(workspaceRoot).digest("hex").slice(0, 16)
}

function normalizeValue(value: unknown) {
  if (typeof value !== "string") return ""
  return value.trim()
}

function applyEnvFallback(config: unknown) {
  const next: Record<string, unknown> =
    typeof config === "object" && config
      ? { ...(config as Record<string, unknown>) }
      : {}
  const channels =
    typeof next.channels === "object" && next.channels
      ? { ...(next.channels as Record<string, unknown>) }
      : {}
  if (!("tui" in channels) && typeof next.tui === "object" && next.tui) {
    channels.tui = next.tui
  }
  const envModel = process.env.AI_MODEL || ""
  const envProvider = process.env.AI_PROVIDER || ""
  const envBaseUrl = process.env.AI_BASE_URL || ""
  const envAccessToken =
    process.env.AI_ACCESS_TOKEN || process.env.OPENAI_API_KEY || ""

  const ai =
    typeof next.ai === "object" && next.ai
      ? { ...(next.ai as Record<string, unknown>) }
      : {}
  const aiModel = normalizeValue(ai.model)
  if (!aiModel && envModel) {
    ai.model = envModel
  }
  const aiProvider = normalizeValue(ai.provider)
  if (!aiProvider && envProvider) {
    ai.provider = envProvider
  }
  const aiBaseUrl = normalizeValue(ai.baseUrl)
  if (!aiBaseUrl && envBaseUrl) {
    ai.baseUrl = envBaseUrl
  }
  const aiAccessToken = normalizeValue(ai.accessToken)
  if (!aiAccessToken && envAccessToken) {
    ai.accessToken = envAccessToken
  }
  next.ai = ai
  next.channels = channels
  delete next.tui

  return next
}

function assertNoLegacyContextConfig(config: unknown) {
  if (
    typeof config === "object" &&
    config !== null &&
    "context" in (config as Record<string, unknown>)
  ) {
    throw new Error(
      "bot.yml `context` section has been removed; delete it and retry",
    )
  }
}

function normalizeSkillPolicies(entries: string[] = []) {
  return Array.from(
    new Set(
      entries
        .filter((entry) => typeof entry === "string")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean),
    ),
  )
}

function buildSkillSources(config: BotConfig, workspaceRoot: string) {
  const configuredSources = (config.skills?.sources || []).map((source) => ({
    id: source.id,
    kind: "filesystem" as const,
    dir: resolve(workspaceRoot, source.dir),
    readonly: Boolean(source.readonly),
  }))
  const projectSkillSource = {
    id: "project",
    kind: "filesystem" as const,
    dir: resolve(workspaceRoot, "skills"),
    readonly: false,
  }
  const defaults: SkillSource[] = [
    getBuiltinSkillSource(),
    projectSkillSource,
  ]
  const merged = [...defaults, ...configuredSources]
  const unique = new Map<string, SkillSource>()
  merged.forEach((source) => {
    if (!source.id || unique.has(source.id)) return
    unique.set(source.id, source)
  })
  return Array.from(unique.values())
}

function resolveTuiChannelConfig(
  channel?: BotConfig["channels"]["tui"],
): TuiChannelRuntimeConfig {
  return {
    enabled: channel?.enabled !== false,
    label: normalizeValue(channel?.label) || "local",
    operatorUsername: normalizeValue(channel?.operatorUsername) || "local",
    operatorFirstName: normalizeValue(channel?.operatorFirstName) || "Local",
    operatorLastName: normalizeValue(channel?.operatorLastName) || "Operator",
  }
}

export function loadConfig(options: {
  workspaceRoot?: string
  runtimeRoot?: string
} = {}): BotRuntimeConfig {
  const runtimeRoot = resolve(options.runtimeRoot || resolveRuntimeRoot())
  const configPath = resolveConfigPath(runtimeRoot)
  if (!existsSync(configPath)) {
    throw new Error(`bot.yml not found at ${configPath}`)
  }
  const raw = readFileSync(configPath, "utf-8")
  const parsed = yaml.parse(raw) || {}
  assertNoLegacyContextConfig(parsed)
  const withEnv = applyEnvFallback(parsed)
  const config = BotConfigSchema.parse(withEnv)
  const workspaceRoot = normalizeWorkspaceRoot(options.workspaceRoot)
  const workspaceId = buildWorkspaceId(workspaceRoot)
  const workspaceRuntimeRoot = resolve(runtimeRoot, "workspaces", workspaceId)
  const skillSources = buildSkillSources(config, workspaceRoot)
  const skillAllowlist = normalizeSkillPolicies(config.skills?.allowlist)
  const skillDenylist = normalizeSkillPolicies(config.skills?.denylist)
  const toolAllowlist = normalizeSkillPolicies(config.tools?.allowlist)
  const toolDenylist = normalizeSkillPolicies(config.tools?.denylist)
  const tuiChannel = resolveTuiChannelConfig(config.channels.tui)

  return {
    ...config,
    channels: {
      ...config.channels,
      tui: tuiChannel,
    },
    runtimeRoot,
    workspaceRoot,
    workspaceId,
    workspaceRuntimeRoot,
    skillsDir: resolve(workspaceRoot, "skills"),
    attachmentsDir: resolve(workspaceRuntimeRoot, "attachments"),
    sessionsDir: resolve(workspaceRuntimeRoot, "sessions"),
    historyDir: resolve(workspaceRuntimeRoot, "history"),
    permissionsDir: resolve(workspaceRuntimeRoot, "permissions"),
    soulRuntimeDir: resolve(workspaceRuntimeRoot, "soul"),
    systemDir: resolve(workspaceRuntimeRoot, "system"),
    memoryDir: resolve(workspaceRoot, "memory"),
    knowledgeDir: resolve(workspaceRoot, "knowledge"),
    skillSources,
    skillAllowlist,
    skillDenylist,
    toolAllowlist,
    toolDenylist,
  }
}
