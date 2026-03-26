import { readFileSync, existsSync, realpathSync } from "node:fs"
import { homedir } from "node:os"
import { resolve } from "node:path"
import { createHash } from "node:crypto"
import dotenv from "dotenv"
import { z } from "zod"
import yaml from "yaml"

dotenv.config({ path: resolve(process.cwd(), ".env") })

export const BOT_RUNTIME_DIRNAME = ".myz-bot"

const SkillSourceConfigSchema = z.object({
  id: z.string().min(1),
  dir: z.string().min(1),
  readonly: z.boolean().optional().default(false),
})

const BotConfigSchema = z.object({
  telegram: z.object({
    username: z.string().min(1),
    token: z.string().min(1),
    timeoutSeconds: z.number().int().positive().optional().default(25),
    allowedUsers: z.array(z.string().min(1)).optional().default([]),
    allowedChats: z.array(z.number().int()).optional().default([]),
    adminUsers: z.array(z.string().min(1)).optional().default([]),
    saveIncomingMedia: z.boolean().optional().default(true),
    groupResponseMode: z
      .object({
        onlyWhenMentioned: z.boolean().optional().default(true),
        allowReplyToBot: z.boolean().optional().default(true),
        allowAdminCommands: z.boolean().optional().default(true),
      })
      .optional()
      .default({
        onlyWhenMentioned: true,
        allowReplyToBot: true,
        allowAdminCommands: true,
      }),
    retry: z
      .object({
        retries: z.number().int().min(0).optional().default(2),
        baseDelayMs: z.number().int().min(0).optional().default(800),
      })
      .optional()
      .default({
        retries: 2,
        baseDelayMs: 800,
      }),
  }),
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
    provider: z.string().min(1),
    baseUrl: z.string().optional().default(""),
    accessToken: z.string().optional().default(""),
    headers: z.record(z.string(), z.string()).default({}),
    model: z.string().min(1),
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
  context: z
    .object({
      maxHistoryMessages: z.number().int().positive().optional().default(120),
      maxHistoryChars: z.number().int().positive().optional().default(120_000),
      compressionThreshold: z.number().int().positive().optional().default(160),
      compressionCooldownMs: z.number().int().min(0).optional().default(300_000),
      summaryMaxMessages: z.number().int().positive().optional().default(20),
      summaryMaxChars: z.number().int().positive().optional().default(6_000),
    })
    .optional()
    .default({
      maxHistoryMessages: 120,
      maxHistoryChars: 120_000,
      compressionThreshold: 160,
      compressionCooldownMs: 300_000,
      summaryMaxMessages: 20,
      summaryMaxChars: 6_000,
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
      autoDraft: z.boolean().optional().default(true),
      autoApply: z.boolean().optional().default(true),
      reviewRequired: z.boolean().optional().default(true),
      autoDraftMessageInterval: z.number().int().positive().optional().default(40),
      autoDraftTimeIntervalMs: z.number().int().positive().optional().default(14_400_000),
      growthFeedbackBatchMessageInterval: z.number().int().positive().optional().default(20),
      growthFeedbackTimeIntervalMs: z.number().int().positive().optional().default(3_600_000),
      relationshipReflectionMessageInterval: z.number().int().positive().optional().default(20),
      relationshipReflectionTimeIntervalMs: z.number().int().positive().optional().default(3_600_000),
    })
    .optional()
    .default({
      autoDraft: true,
      autoApply: true,
      reviewRequired: true,
      autoDraftMessageInterval: 40,
      autoDraftTimeIntervalMs: 14_400_000,
      growthFeedbackBatchMessageInterval: 20,
      growthFeedbackTimeIntervalMs: 3_600_000,
      relationshipReflectionMessageInterval: 20,
      relationshipReflectionTimeIntervalMs: 3_600_000,
    }),
})

export type BotConfig = z.infer<typeof BotConfigSchema>
export interface SkillSourceConfig {
  id: string
  dir: string
  readonly?: boolean
}

export type BotRuntimeConfig = BotConfig & {
  runtimeRoot: string
  workspaceRoot: string
  workspaceId: string
  workspaceRuntimeRoot: string
  skillsDir: string
  conversationsDir: string
  permissionsDir: string
  relationshipsDir: string
  soulRuntimeDir: string
  systemDir: string
  memoryDir: string
  skillSources: SkillSourceConfig[]
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
  const envUsername = process.env.TELEGRAM_BOT_USERNAME || ""
  const envToken = process.env.TELEGRAM_BOT_TOKEN || ""
  const envModel = process.env.AI_MODEL || ""
  const envProvider = process.env.AI_PROVIDER || ""
  const envBaseUrl = process.env.AI_BASE_URL || ""
  const envAccessToken =
    process.env.AI_ACCESS_TOKEN || process.env.OPENAI_API_KEY || ""

  const telegram =
    typeof next.telegram === "object" && next.telegram
      ? { ...(next.telegram as Record<string, unknown>) }
      : {}
  const telegramUsername = normalizeValue(telegram.username)
  if (!telegramUsername && envUsername) {
    telegram.username = envUsername
  }
  const telegramToken = normalizeValue(telegram.token)
  if (!telegramToken && envToken) {
    telegram.token = envToken
  }
  next.telegram = telegram

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

  return next
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
  const builtinSkillsDir = resolve(
    workspaceRoot,
    "myz-annotator/src/skills/builtin",
  )
  const configuredSources = (config.skills?.sources || []).map((source) => ({
    id: source.id,
    dir: resolve(workspaceRoot, source.dir),
    readonly: Boolean(source.readonly),
  }))
  const projectSkillSource = {
    id: "project",
    dir: resolve(workspaceRoot, ".myz/skills"),
    readonly: false,
  }
  const defaults: SkillSourceConfig[] = [
    { id: "builtin", dir: builtinSkillsDir, readonly: true },
    projectSkillSource,
  ]
  const merged = [...defaults, ...configuredSources]
  const unique = new Map<string, SkillSourceConfig>()
  merged.forEach((source) => {
    if (!source.id || unique.has(source.id)) return
    unique.set(source.id, source)
  })
  return Array.from(unique.values())
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

  return {
    ...config,
    runtimeRoot,
    workspaceRoot,
    workspaceId,
    workspaceRuntimeRoot,
    skillsDir: resolve(workspaceRoot, ".myz/skills"),
    conversationsDir: resolve(workspaceRuntimeRoot, "conversations"),
    permissionsDir: resolve(workspaceRuntimeRoot, "permissions"),
    relationshipsDir: resolve(workspaceRuntimeRoot, "relationships"),
    soulRuntimeDir: resolve(workspaceRuntimeRoot, "soul"),
    systemDir: resolve(workspaceRuntimeRoot, "system"),
    memoryDir: resolve(workspaceRoot, "memory"),
    skillSources,
    skillAllowlist,
    skillDenylist,
    toolAllowlist,
    toolDenylist,
  }
}
