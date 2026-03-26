import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createInterface } from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import { resolve } from "node:path"
import yaml from "yaml"
import { DEFAULT_SOUL, ensureSoulFile } from "./soul"
import { DEFAULT_MEMORY_FILE_CONTENT, ensureMemoryDir } from "./memory"
import {
  DEFAULT_AGENTS_TEMPLATE,
  DEFAULT_BOOTSTRAP_TEMPLATE,
} from "./workspaceTemplates"
import { buildWorkspaceId, resolveConfigPath, resolveRuntimeRoot } from "./config"

const DEFAULT_GITIGNORE = `*
!.gitignore
!AGENTS.md
!BOOTSTRAP.md
!SOUL.md
!IDENTITY.md
!USER.md
!memory/
memory/*
!memory/*.md
`

const DEFAULT_IDENTITY = `# IDENTITY.md

- 名字：
- 自称：
- 对外身份：
- 语气与风格：
`

const DEFAULT_USER = `# USER.md

- 用户称呼：
- 时区：
- 稳定偏好：
- 边界：
`

function buildBotConfigYml(options: {
  telegramUsername: string
  telegramToken: string
  aiProvider: string
  aiBaseUrl: string
  aiAccessToken: string
  aiModel: string
}) {
  return `telegram:
  username: "${options.telegramUsername}"
  token: "${options.telegramToken}"
  timeoutSeconds: 25
  allowedUsers: []
  allowedChats: []
  adminUsers: []
  saveIncomingMedia: true
  groupResponseMode:
    onlyWhenMentioned: true
    allowReplyToBot: true
    allowAdminCommands: true
  retry:
    retries: 2
    baseDelayMs: 800

network:
  requestTimeoutMs: 180000
  connectTimeoutMs: 10000
  keepAliveTimeoutMs: 4000
  keepAliveTimeoutThresholdMs: 2000
  proxyUrl: ""

ai:
  provider: ${options.aiProvider}
  baseUrl: "${options.aiBaseUrl}"
  accessToken: "${options.aiAccessToken}"
  headers: {}
  model: "${options.aiModel}"
  systemPromptInUserMessage: false
  retry:
    retries: 2
    baseDelayMs: 1000
  capabilities:
    toolCalling: true
    reasoning: false
    vision: false
    imageOutput: false
  limits:
    contextWindow: 8192
    maxOutputTokens: 1024
    maxOutputTokenParam: max_tokens
  tooling:
    toolChoice: auto
    strict: auto
    parallelToolCalls: auto

mcpServers: []
skills:
  sources: []
  allowlist: []
  denylist: []
tools:
  allowlist: []
  denylist: []
scheduler:
  enabled: true
  pollIntervalMs: 15000
  maxBatchSize: 20
  failureRetryBaseDelayMs: 60000
upgrade:
  enabled: true
  packageName: "myz-bot"
  channel: "latest"
  checkIntervalMs: 21600000
  strategy: "notify"
  applyMode: "manual"
  allowPrerelease: false
soul:
  autoDraft: true
  autoApply: true
  reviewRequired: true
  autoDraftMessageInterval: 40
  autoDraftTimeIntervalMs: 14400000
  growthFeedbackBatchMessageInterval: 20
  growthFeedbackTimeIntervalMs: 3600000
  relationshipReflectionMessageInterval: 20
  relationshipReflectionTimeIntervalMs: 3600000
`
}

export interface InitAnswers {
  telegramUsername: string
  telegramToken: string
  aiProvider: string
  aiBaseUrl: string
  aiAccessToken: string
  aiModel: string
}

export interface InitWorkspaceOptions {
  workspaceRoot?: string
  runtimeRoot?: string
  answers?: Partial<InitAnswers>
  existingConfigAction?: "reuse" | "update"
  onResolveExistingConfig?: (
    configPath: string,
  ) => Promise<"reuse" | "update"> | "reuse" | "update"
  onPrompt?: (
    key: keyof InitAnswers,
    prompt: string,
    defaultValue: string,
    required: boolean,
  ) => Promise<string> | string
}

const PROMPTS: Array<{
  key: keyof InitAnswers
  label: string
  defaultValue: string
  required: boolean
}> = [
  {
    key: "telegramUsername",
    label: "Telegram bot username",
    defaultValue: "",
    required: true,
  },
  {
    key: "telegramToken",
    label: "Telegram bot token",
    defaultValue: "",
    required: true,
  },
  {
    key: "aiProvider",
    label: "LLM provider",
    defaultValue: "openai_compatible",
    required: true,
  },
  {
    key: "aiBaseUrl",
    label: "LLM base URL",
    defaultValue: "https://api.openai.com/v1/chat/completions",
    required: false,
  },
  {
    key: "aiAccessToken",
    label: "LLM access token",
    defaultValue: "${OPENAI_API_KEY}",
    required: false,
  },
  {
    key: "aiModel",
    label: "LLM model",
    defaultValue: "gpt-4o-mini",
    required: true,
  },
]

function readExistingInitAnswers(configPath: string): Partial<InitAnswers> {
  if (!existsSync(configPath)) return {}
  const parsed = yaml.parse(readFileSync(configPath, "utf-8")) as Record<string, any> | null
  return {
    telegramUsername:
      typeof parsed?.telegram?.username === "string" ? parsed.telegram.username : "",
    telegramToken:
      typeof parsed?.telegram?.token === "string" ? parsed.telegram.token : "",
    aiProvider:
      typeof parsed?.ai?.provider === "string" ? parsed.ai.provider : "",
    aiBaseUrl:
      typeof parsed?.ai?.baseUrl === "string" ? parsed.ai.baseUrl : "",
    aiAccessToken:
      typeof parsed?.ai?.accessToken === "string" ? parsed.ai.accessToken : "",
    aiModel:
      typeof parsed?.ai?.model === "string" ? parsed.ai.model : "",
  }
}

async function resolveExistingConfigAction(
  options: InitWorkspaceOptions,
  configPath: string,
): Promise<"reuse" | "update"> {
  if (options.existingConfigAction) {
    return options.existingConfigAction
  }
  if (options.onResolveExistingConfig) {
    return await options.onResolveExistingConfig(configPath)
  }
  if (!input.isTTY || !output.isTTY) {
    throw new Error(
      `检测到已有 bot.yml：${configPath}。请显式指定 existingConfigAction 为 reuse 或 update。`,
    )
  }

  const rl = createInterface({ input, output })
  try {
    while (true) {
      const reply = (
        await rl.question(
          `检测到已有 bot.yml：${configPath}\n输入 reuse 复用现有配置，或输入 update 更新配置 [reuse]: `,
        )
      )
        .trim()
        .toLowerCase()
      if (!reply || reply === "reuse") return "reuse"
      if (reply === "update") return "update"
    }
  } finally {
    rl.close()
  }
}

async function collectAnswers(options: InitWorkspaceOptions): Promise<InitAnswers> {
  const initial = options.answers || {}
  const hasAllPresetAnswers = PROMPTS.every((prompt) => {
    const value = initial[prompt.key]
    if (typeof value !== "string") return false
    if (!prompt.required) return true
    return value.trim().length > 0
  })
  if (hasAllPresetAnswers) {
    const answers = {} as InitAnswers
    PROMPTS.forEach((prompt) => {
      answers[prompt.key] = String(initial[prompt.key] || prompt.defaultValue).trim()
    })
    return answers
  }
  if (options.onPrompt) {
    const answers = {} as InitAnswers
    for (const prompt of PROMPTS) {
      const preset = initial[prompt.key]?.trim() || ""
      if (preset) {
        answers[prompt.key] = preset
        continue
      }
      let value = ""
      while (!value) {
        const reply = await options.onPrompt(
          prompt.key,
          prompt.label,
          prompt.defaultValue,
          prompt.required,
        )
        value = String(reply || "").trim() || prompt.defaultValue.trim()
        if (!prompt.required || value) break
      }
      answers[prompt.key] = value
    }
    return answers
  }

  if (!input.isTTY || !output.isTTY) {
    throw new Error("init 需要交互式终端，或通过 options.answers/options.onPrompt 提供配置")
  }

  const rl = createInterface({ input, output })
  try {
    const answers = {} as InitAnswers
    for (const prompt of PROMPTS) {
      const preset = initial[prompt.key]?.trim() || ""
      if (preset) {
        answers[prompt.key] = preset
        continue
      }
      let value = ""
      while (!value) {
        const suffix = prompt.defaultValue ? ` [${prompt.defaultValue}]` : ""
        const reply = await rl.question(`${prompt.label}${suffix}: `)
        value = reply.trim() || prompt.defaultValue.trim()
        if (!prompt.required || value) break
      }
      answers[prompt.key] = value
    }
    return answers
  } finally {
    rl.close()
  }
}

function ensureFile(path: string, content: string) {
  if (!existsSync(path)) {
    writeFileSync(path, content)
  }
}

export async function initWorkspace(options: string | InitWorkspaceOptions = {}) {
  const settings =
    typeof options === "string"
      ? ({ workspaceRoot: options } satisfies InitWorkspaceOptions)
      : options
  const workspaceRoot = resolve(settings.workspaceRoot || process.cwd())
  const runtimeRoot = resolve(settings.runtimeRoot || resolveRuntimeRoot())
  const configPath = resolveConfigPath(runtimeRoot)
  const workspaceRuntimeRoot = resolve(runtimeRoot, "workspaces", buildWorkspaceId(workspaceRoot))
  const hasExistingConfig = existsSync(configPath)
  const existingAnswers = hasExistingConfig ? readExistingInitAnswers(configPath) : {}
  const existingConfigAction = hasExistingConfig
    ? await resolveExistingConfigAction(settings, configPath)
    : "update"
  const shouldWriteConfig = !hasExistingConfig || existingConfigAction === "update"
  const answers = shouldWriteConfig
    ? await collectAnswers({
        ...settings,
        answers: {
          ...existingAnswers,
          ...(settings.answers || {}),
        },
      })
    : null

  mkdirSync(runtimeRoot, { recursive: true })
  mkdirSync(workspaceRuntimeRoot, { recursive: true })
  mkdirSync(workspaceRoot, { recursive: true })
  mkdirSync(resolve(workspaceRoot, "memory"), { recursive: true })

  if (answers) {
    writeFileSync(configPath, buildBotConfigYml(answers))
  }

  ensureFile(resolve(workspaceRoot, "SOUL.md"), DEFAULT_SOUL)
  ensureSoulFile(workspaceRoot, workspaceRuntimeRoot)
  ensureFile(resolve(workspaceRoot, "AGENTS.md"), DEFAULT_AGENTS_TEMPLATE)
  ensureFile(resolve(workspaceRoot, "BOOTSTRAP.md"), DEFAULT_BOOTSTRAP_TEMPLATE)
  ensureFile(resolve(workspaceRoot, "IDENTITY.md"), DEFAULT_IDENTITY)
  ensureFile(resolve(workspaceRoot, "USER.md"), DEFAULT_USER)
  ensureFile(resolve(workspaceRoot, ".gitignore"), DEFAULT_GITIGNORE)
  ensureMemoryDir(resolve(workspaceRoot, "memory"))
  ensureFile(resolve(workspaceRoot, "memory", "MEMORY.md"), DEFAULT_MEMORY_FILE_CONTENT)

  console.log(`init completed
workspace: ${workspaceRoot}
runtime: ${runtimeRoot}
config: ${configPath}`)
}
