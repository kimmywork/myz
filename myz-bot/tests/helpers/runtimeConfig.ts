import { join } from "node:path"
import type { BotRuntimeConfig } from "../../src/config"

type RuntimeConfigOverrides =
  Omit<
    Partial<BotRuntimeConfig>,
    "telegram" | "network" | "ai" | "skills" | "tools" | "scheduler" | "upgrade" | "soul"
  > & {
    telegram?: Partial<BotRuntimeConfig["telegram"]> & {
      groupResponseMode?: Partial<BotRuntimeConfig["telegram"]["groupResponseMode"]>
      retry?: Partial<BotRuntimeConfig["telegram"]["retry"]>
    }
    network?: Partial<BotRuntimeConfig["network"]>
    ai?: Partial<BotRuntimeConfig["ai"]> & {
      retry?: Partial<BotRuntimeConfig["ai"]["retry"]>
      capabilities?: Partial<BotRuntimeConfig["ai"]["capabilities"]>
      limits?: Partial<BotRuntimeConfig["ai"]["limits"]>
      tooling?: Partial<BotRuntimeConfig["ai"]["tooling"]>
    }
    skills?: Partial<BotRuntimeConfig["skills"]>
    tools?: Partial<BotRuntimeConfig["tools"]>
    scheduler?: Partial<BotRuntimeConfig["scheduler"]>
    upgrade?: Partial<BotRuntimeConfig["upgrade"]>
    soul?: Partial<BotRuntimeConfig["soul"]>
  }

export function createRuntimeConfig(
  root: string,
  overrides: RuntimeConfigOverrides = {},
): BotRuntimeConfig {
  const workspaceRuntimeRoot = join(root, ".runtime")
  const base: BotRuntimeConfig = {
    telegram: {
      username: "testbot",
      token: "token",
      timeoutSeconds: 25,
      allowedUsers: [],
      allowedChats: [],
      adminUsers: [],
      saveIncomingMedia: true,
      groupResponseMode: {
        onlyWhenMentioned: true,
        allowReplyToBot: true,
        allowAdminCommands: true,
      },
      retry: {
        retries: 2,
        baseDelayMs: 800,
      },
    },
    network: {
      requestTimeoutMs: 180000,
      connectTimeoutMs: 10000,
      keepAliveTimeoutMs: 4000,
      keepAliveTimeoutThresholdMs: 2000,
      proxyUrl: "",
    },
    ai: {
      provider: "openai_compatible",
      baseUrl: "",
      accessToken: "",
      headers: {},
      model: "gpt-test",
      systemPromptInUserMessage: false,
      retry: {
        retries: 2,
        baseDelayMs: 1000,
      },
      capabilities: {
        toolCalling: true,
        reasoning: false,
        vision: false,
        imageOutput: false,
      },
      limits: {
        contextWindow: 8192,
        maxOutputTokens: 1024,
        maxOutputTokenParam: "max_tokens",
      },
      tooling: {
        toolChoice: "auto",
        strict: "auto",
        parallelToolCalls: "auto",
      },
    },
    mcpServers: [],
    runtimeRoot: join(root, ".home"),
    workspaceRoot: root,
    workspaceId: "test-workspace",
    workspaceRuntimeRoot,
    skillsDir: join(root, "skills"),
    attachmentsDir: join(workspaceRuntimeRoot, "attachments"),
    skills: { sources: [], allowlist: [], denylist: [] },
    tools: { allowlist: [], denylist: [] },
    conversationsDir: join(workspaceRuntimeRoot, "conversations"),
    permissionsDir: join(workspaceRuntimeRoot, "permissions"),
    relationshipsDir: join(workspaceRuntimeRoot, "relationships"),
    soulRuntimeDir: join(workspaceRuntimeRoot, "soul"),
    systemDir: join(workspaceRuntimeRoot, "system"),
    memoryDir: join(root, "memory"),
    scheduler: {
      enabled: true,
      pollIntervalMs: 15000,
      maxBatchSize: 20,
      failureRetryBaseDelayMs: 60000,
    },
    upgrade: {
      enabled: true,
      packageName: "myz-bot",
      channel: "latest",
      checkIntervalMs: 21600000,
      strategy: "notify",
      applyMode: "manual",
      allowPrerelease: false,
    },
    soul: {
      autoDraft: true,
      autoApply: true,
      reviewRequired: true,
      autoDraftMessageInterval: 12,
      autoDraftTimeIntervalMs: 3600000,
      growthFeedbackBatchMessageInterval: 12,
      growthFeedbackTimeIntervalMs: 1800000,
      relationshipReflectionMessageInterval: 12,
      relationshipReflectionTimeIntervalMs: 1800000,
    },
    skillSources: [],
    skillAllowlist: [],
    skillDenylist: [],
    toolAllowlist: [],
    toolDenylist: [],
  }

  return {
    ...base,
    ...overrides,
    telegram: {
      ...base.telegram,
      ...overrides.telegram,
      groupResponseMode: {
        ...base.telegram.groupResponseMode,
        ...(overrides.telegram?.groupResponseMode || {}),
      },
      retry: {
        ...base.telegram.retry,
        ...(overrides.telegram?.retry || {}),
      },
    },
    network: {
      ...base.network,
      ...overrides.network,
    },
    ai: {
      ...base.ai,
      ...overrides.ai,
      retry: {
        ...base.ai.retry,
        ...(overrides.ai?.retry || {}),
      },
      capabilities: {
        ...base.ai.capabilities,
        ...(overrides.ai?.capabilities || {}),
      },
      limits: {
        ...base.ai.limits,
        ...(overrides.ai?.limits || {}),
      },
      tooling: {
        ...base.ai.tooling,
        ...(overrides.ai?.tooling || {}),
      },
    },
    skills: {
      ...base.skills,
      ...overrides.skills,
    },
    tools: {
      ...base.tools,
      ...overrides.tools,
    },
    scheduler: {
      ...base.scheduler,
      ...overrides.scheduler,
    },
    upgrade: {
      ...base.upgrade,
      ...overrides.upgrade,
    },
    soul: {
      ...base.soul,
      ...overrides.soul,
    },
  }
}
