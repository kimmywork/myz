import type {
  ToolDefinition,
  ToolHandler,
  AgentDefinition,
  HookEvent,
  HookHandler,
  PromptSegment,
  CommandDefinition,
} from "./types"

export interface ExtensionAPI {
  registerTool(definition: ToolDefinition, handler: ToolHandler): void
  registerAgent(agent: AgentDefinition): void
  registerHook(event: HookEvent["type"], handler: HookHandler): void
  registerPrompt(segment: PromptSegment): void
  registerCommand(command: CommandDefinition): void
}

export interface ExtensionState {
  tools: Map<string, { definition: ToolDefinition; handler: ToolHandler }>
  agents: Map<string, AgentDefinition>
  hooks: Map<string, HookHandler[]>
  prompts: PromptSegment[]
  commands: Map<string, CommandDefinition>
}

export function createExtensionState(): ExtensionState {
  return {
    tools: new Map(),
    agents: new Map(),
    hooks: new Map(),
    prompts: [],
    commands: new Map(),
  }
}

export function createExtensionAPI(state: ExtensionState): ExtensionAPI {
  return {
    registerTool(definition, handler) {
      state.tools.set(definition.name, { definition, handler })
    },

    registerAgent(agent) {
      state.agents.set(agent.id, agent)
    },

    registerHook(event, handler) {
      const existing = state.hooks.get(event) || []
      existing.push(handler)
      state.hooks.set(event, existing)
    },

    registerPrompt(segment) {
      state.prompts.push(segment)
      state.prompts.sort((a, b) => (b.priority || 0) - (a.priority || 0))
    },

    registerCommand(command) {
      state.commands.set(command.name, command)
    },
  }
}

export async function emitHooks(
  state: ExtensionState,
  event: HookEvent["type"],
  payload: Record<string, unknown>,
): Promise<void> {
  const handlers = state.hooks.get(event) || []
  for (const handler of handlers) {
    await handler(payload as any)
  }
}
