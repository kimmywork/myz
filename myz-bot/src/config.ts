import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import dotenv from "dotenv"
import { z } from "zod"
import yaml from "yaml"

dotenv.config({ path: resolve(process.cwd(), ".env") })

const BotConfigSchema = z.object({
  telegram: z.object({
    username: z.string().min(1),
    token: z.string().min(1),
  }),
  ai: z.object({
    provider: z.string().min(1),
    baseUrl: z.string().optional().default(""),
    accessToken: z.string().optional().default(""),
    headers: z.record(z.string(), z.string()).default({}),
    model: z.string().min(1),
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
  workspaceRoot: z.string().default("."),
  skillsDir: z.string().default(".myz/skills"),
  conversationsDir: z.string().default("conversations"),
  memoryDir: z.string().default("memory"),
})

export type BotConfig = z.infer<typeof BotConfigSchema>
export interface SkillSourceConfig {
  id: string
  dir: string
  readonly?: boolean
}

export type BotRuntimeConfig = BotConfig & {
  workspaceRoot: string
  skillsDir: string
  conversationsDir: string
  memoryDir: string
  skillSources: SkillSourceConfig[]
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

export function loadConfig(
  configPath = resolve(process.cwd(), "bot.yml"),
): BotRuntimeConfig {
  if (!existsSync(configPath)) {
    throw new Error(`bot.yml not found at ${configPath}`)
  }
  const raw = readFileSync(configPath, "utf-8")
  const parsed = yaml.parse(raw) || {}
  const withEnv = applyEnvFallback(parsed)
  const config = BotConfigSchema.parse(withEnv)
  const workspaceRoot = resolve(config.workspaceRoot)
  const builtinSkillsDir = resolve(
    workspaceRoot,
    "myz-annotator/src/skills/builtin",
  )
  const skillSources: SkillSourceConfig[] = [
    { id: "builtin", dir: builtinSkillsDir, readonly: true },
  ]

  return {
    ...config,
    workspaceRoot,
    skillsDir: resolve(workspaceRoot, config.skillsDir),
    conversationsDir: resolve(workspaceRoot, config.conversationsDir),
    memoryDir: resolve(workspaceRoot, config.memoryDir),
    skillSources,
  }
}
