import type { AgentConfig, ProviderConfig, ModelConfig } from "./types"

export type {
  PermissionRule,
  AgentDefinition,
  ToolDefinition,
  ToolHandler,
  ToolContext,
  ToolResult,
  HookEvent,
  HookHandler,
  HookEventPayload,
  PromptSegment,
  AgentEvent,
  AgentResult,
  ContextCompactionResult,
  SessionMetadata,
  CommandDefinition,
  CommandContext,
  ModelConfig,
  ProviderConfig,
  ContextConfig,
  AgentConfig,
} from "./types"

export { matchPermission, createPermissionEngine } from "./permissions"
export type { PermissionContext } from "./permissions"

export {
  createExtensionState,
  createExtensionAPI,
  emitHooks,
} from "./extensions"
export type { ExtensionAPI, ExtensionState } from "./extensions"

export { runAgentLoop } from "./loop"
export type { AgentLoopOptions } from "./loop"

export { loadAgentDefinitions, loadBuiltinAgentDefinitions } from "./agents"
export { loadRules, buildRulesPrompt } from "./rules"
export type { RuleSegment } from "./rules"
export { createCommands, matchCommand, parseBotCommand, isSupportedBotCommandName, isPassthroughBotCommandName, formatSupportedBotCommands, SUPPORTED_BOT_COMMAND_NAMES } from "./commands"
export { compactContext } from "./contextCompaction"
export type { CompactionResult } from "./contextCompaction"
export { spawnSubagent, buildTaskToolDescription } from "./subagent"
export type { SubagentSpawnOptions, SubagentResult } from "./subagent"
export { createLocalTools } from "./tools"
export type { LocalTool } from "./tools"

export function resolveModel(config: AgentConfig) {
  const pid = config.defaults.provider
  const mid = config.defaults.model
  if (!pid || !mid) return null
  const provider = config.providers[pid]
  if (!provider) return null
  const model = provider.models.find((m: ModelConfig) => m.id === mid)
  if (!model) return null
  return { provider, model }
}
