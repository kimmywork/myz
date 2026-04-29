import { join } from "node:path"
import type { BotRuntimeConfig } from "../../src/config"

type RuntimeConfigOverrides =
  Omit<
    Partial<BotRuntimeConfig>,
    "channels" | "network" | "ai" | "contextCompaction" | "skills" | "tools" | "scheduler" | "upgrade" | "soul"
  > & {
    channels?: Partial<BotRuntimeConfig["channels"]> & {
      telegram?: Partial<NonNullable<BotRuntimeConfig["channels"]["telegram"]>> & {
        groupResponseMode?: Partial<NonNullable<BotRuntimeConfig["channels"]["telegram"]>["groupResponseMode"]>
        retry?: Partial<NonNullable<BotRuntimeConfig["channels"]["telegram"]>["retry"]>
      }
      tui?: Partial<BotRuntimeConfig["channels"]["tui"]>
    }
    network?: Partial<BotRuntimeConfig["network"]>
    ai?: Partial<BotRuntimeConfig["ai"]> & {
      retry?: Partial<BotRuntimeConfig["ai"]["retry"]>
      capabilities?: Partial<BotRuntimeConfig["ai"]["capabilities"]>
      limits?: Partial<BotRuntimeConfig["ai"]["limits"]>
      tooling?: Partial<BotRuntimeConfig["ai"]["tooling"]>
    }
    contextCompaction?: Partial<BotRuntimeConfig["contextCompaction"]>
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
    channels: {
      telegram: {
        enabled: true,
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
      tui: {
        enabled: true,
        label: "local",
        operatorUsername: "local",
        operatorFirstName: "Local",
        operatorLastName: "Operator",
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
      compatProfile: "auto",
      reasoningMode: "provider_default",
      reasoningEffort: "provider_default",
      model: "gpt-test",
      streamingEnabled: true,
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
    contextCompaction: {
      enabled: true,
      maxHistoryMessages: 120,
      maxHistoryChars: 120000,
      summaryMaxMessages: 20,
      summaryMaxChars: 6000,
      compressionCooldownMs: 300000,
    },
    debug: false,
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
      reviewRequired: true,
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
    channels: {
      ...base.channels,
      ...(overrides.channels || {}),
      telegram:
        overrides.channels?.telegram === null
          ? null
          : {
              ...(base.channels.telegram || {}),
              ...(overrides.channels?.telegram || {}),
              groupResponseMode: {
                ...base.channels.telegram?.groupResponseMode,
                ...(overrides.channels?.telegram?.groupResponseMode || {}),
              },
              retry: {
                ...base.channels.telegram?.retry,
                ...(overrides.channels?.telegram?.retry || {}),
              },
            },
      tui: {
        ...base.channels.tui,
        ...(overrides.channels?.tui || {}),
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
    contextCompaction: {
      ...base.contextCompaction,
      ...(overrides.contextCompaction || {}),
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
