import type { AgentDefinition, AgentConfig, CommandContext } from "./types"
import { loadAgentDefinitions, loadBuiltinAgentDefinitions } from "./agents"
import { resolve, join } from "node:path"
import { existsSync } from "node:fs"

export type { CommandContext } from "./types"

export interface SlashCommand {
  name: string
  description: string
  handler: (args: string[], ctx: CommandContext) => string | null | Promise<string | null>
}

function getAllAgents(config: AgentConfig): AgentDefinition[] {
  const builtin = loadBuiltinAgentDefinitions()
  const custom = loadAgentDefinitions(resolve(config.workspaceRoot, ".agents", "agents"))
  const map = new Map<string, AgentDefinition>()
  for (const a of [...builtin, ...custom]) map.set(a.id, a)
  return Array.from(map.values())
}

export function createCommands(): SlashCommand[] {
  return [
    {
      name: "help",
      description: "显示所有可用命令",
      handler: () => {
        const lines = [
          "可用命令：",
          "  /help       显示此帮助",
          "  /clear      新建会话",
          "  /agents     列出/切换 agent",
          "  /model      查看/切换模型",
          "  /fork       分叉当前会话",
          "  /resume     恢复旧会话",
          "  /tools      列出可用工具",
          "  /context    显示上下文信息",
          "  /compact    手动触发上下文压缩",
        ]
        return lines.join("\n")
      },
    },
    {
      name: "clear",
      description: "新建会话",
      handler: (_args, ctx) => {
        ctx.clearSession()
        return "会话已清空。"
      },
    },
    {
      name: "agents",
      description: "列出/切换 agent",
      handler: (args, ctx) => {
        const agents = getAllAgents(ctx.config)
        if (args.length === 0) {
          const lines = agents.map((a) => {
            const marker = a.id === ctx.currentAgentId ? "●" : "○"
            const mode = a.mode === "subagent" ? " [sub]" : ""
            return `  ${marker} ${a.id}${mode} — ${a.description}`
          })
          return ["可用 agents：", ...lines, "", "用法：/agents <agent-id> 切换"].join("\n")
        }
        const targetId = args[0]
        const target = agents.find((a) => a.id === targetId)
        if (!target) return `未知 agent: ${targetId}`
        ctx.switchAgent(targetId)
        return `已切换到 agent: ${targetId}`
      },
    },
    {
      name: "model",
      description: "查看/切换模型",
      handler: (args, ctx) => {
        const models = ctx.getAvailableModels()
        const current = ctx.config.defaults

        if (args.length === 0) {
          const lines = models.map((m, i) => {
            const isCurrent = m.providerId === current.provider && m.modelId === current.model
            const marker = isCurrent ? "●" : " "
            const caps = Object.entries(m.capabilities)
              .filter(([, v]) => v)
              .map(([k]) => k)
              .join(", ")
            return `  ${marker} [${i + 1}] ${m.providerId}/${m.modelId}  ${m.contextWindow}k context  ${caps}`
          })
          return [
            `当前模型: ${current.provider}/${current.model}`,
            "",
            "可用模型：",
            ...lines,
            "",
            "用法：/model <编号> 或 /model <provider>/<model>",
          ].join("\n")
        }

        const input = args[0]
        const num = Number(input)
        if (Number.isFinite(num) && num >= 1 && num <= models.length) {
          const m = models[num - 1]
          ctx.switchModel(m.providerId, m.modelId)
          return `已切换到: ${m.providerId}/${m.modelId}`
        }

        const parts = input.split("/")
        if (parts.length === 2) {
          const [providerId, modelId] = parts
          const found = models.find((m) => m.providerId === providerId && m.modelId === modelId)
          if (!found) return `未知模型: ${input}`
          ctx.switchModel(providerId, modelId)
          return `已切换到: ${providerId}/${modelId}`
        }

        return "用法：/model <编号> 或 /model <provider>/<model>"
      },
    },
    {
      name: "fork",
      description: "分叉当前会话",
      handler: (_args, ctx) => {
        return `会话 ${ctx.sessionId} 将被分叉（功能待实现）。`
      },
    },
    {
      name: "resume",
      description: "恢复旧会话",
      handler: (_args, ctx) => {
        const sessions = ctx.listSessions()
        if (!sessions.length) return "没有可恢复的会话。"
        const lines = sessions.map((s) => {
          const marker = s.active ? "●" : "○"
          return `  ${marker} ${s.id} — ${s.title || "无标题"}`
        })
        return ["可用会话：", ...lines, "", "用法：/resume <session-id>"].join("\n")
      },
    },
    {
      name: "tools",
      description: "列出可用工具",
      handler: (_args, ctx) => {
        const tools = ctx.listTools()
        if (!tools.length) return "当前没有可用工具。"
        return [
          "可用工具：",
          ...tools.map((tool) => `  - ${tool.name}: ${tool.description}`),
        ].join("\n")
      },
    },
    {
      name: "context",
      description: "显示上下文信息",
      handler: (_args, ctx) => {
        const tokens = ctx.getSessionTokens()
        const pct = tokens.total > 0 ? Math.round((tokens.used / tokens.total) * 100) : 0
        return [
          `会话: ${ctx.sessionId}`,
          `Agent: ${ctx.currentAgentId}`,
          `Token 用量: ${tokens.used} / ${tokens.total} (${pct}%)`,
          `压缩策略: ${ctx.config.context.strategy}`,
        ].join("\n")
      },
    },
    {
      name: "compact",
      description: "手动触发上下文压缩",
      handler: async (_args, ctx) => {
        const result = await ctx.compactSession()
        if (!result.compressed) {
          return `上下文未压缩：当前 ${result.messageCount} 条消息未超过压缩阈值。`
        }
        return [
          "上下文已压缩。",
          `当前保留消息数: ${result.messageCount}`,
          result.summary ? `摘要：\n${result.summary}` : "",
        ].filter(Boolean).join("\n")
      },
    },
  ]
}

export function matchCommand(input: string): { command: string; args: string[] } | null {
  const trimmed = input.trim()
  if (!trimmed.startsWith("/")) return null
  const parts = trimmed.split(/\s+/)
  const name = parts[0].slice(1).toLowerCase()
  const args = parts.slice(1)
  return { command: name, args }
}

// --- Legacy API (used by index.ts) ---

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function normalizeCommandText(raw: string, botUsername: string) {
  if (!raw) return ""
  const pattern = new RegExp(
    `^(\\/\\w+)@${escapeRegExp(botUsername)}(?=\\s|\\/|$)`,
    "i",
  )
  return raw.trim().replace(pattern, "$1")
}

export function parseBotCommand(raw: string, botUsername: string): { name: string; args: string[] } | null {
  const text = normalizeCommandText(raw, botUsername)
  if (!text.startsWith("/")) return null
  const [commandToken, ...args] = text.split(/\s+/)
  return {
    name: commandToken.slice(1).toLowerCase(),
    args,
  }
}

export const SUPPORTED_BOT_COMMAND_NAMES = [
  "help", "clear", "agents", "model", "fork", "resume", "tools", "context", "compact",
] as const

export const PASSTHROUGH_BOT_COMMAND_NAMES = ["start"] as const

export function isSupportedBotCommandName(name: string) {
  return SUPPORTED_BOT_COMMAND_NAMES.includes(
    name as (typeof SUPPORTED_BOT_COMMAND_NAMES)[number],
  )
}

export function isPassthroughBotCommandName(name: string) {
  return PASSTHROUGH_BOT_COMMAND_NAMES.includes(
    name as (typeof PASSTHROUGH_BOT_COMMAND_NAMES)[number],
  )
}

export function formatSupportedBotCommands() {
  return SUPPORTED_BOT_COMMAND_NAMES.map((name) => `/${name}`).join("、")
}
