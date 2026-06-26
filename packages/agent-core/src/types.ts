import type { Message } from "@myz/agent-providers"

export interface PermissionRule {
  pattern: string
  action: "allow" | "ask" | "deny"
}

export interface AgentDefinition {
  id: string
  name?: string
  description: string
  mode: "primary" | "subagent"
  model?: string  // provider:model_id
  tools?: string[]  // 工具名列表，支持 glob pattern（如 Edit(**/*.js), Run(rm **)）
  permissions: PermissionRule[]
  prompt: string
  hidden?: boolean
  maxSteps?: number
}

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolContext,
) => Promise<ToolResult> | ToolResult

export interface ToolContext {
  agentId: string
  sessionId: string
  workspaceRoot: string
}

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>
  isError?: boolean
}

export interface HookEvent {
  type: "pre_tool_call" | "post_tool_call" | "on_error" | "on_session_start"
}

export type HookHandler = (event: HookEventPayload) => Promise<void> | void

export interface HookEventPayload {
  type: HookEvent["type"]
  agentId: string
  sessionId: string
  tool?: string
  args?: Record<string, unknown>
  result?: ToolResult
  error?: Error
}

export interface PromptSegment {
  id: string
  content: string
  priority?: number
  scope?: "system" | "context" | "history"
}

export interface AgentEvent {
  type: "text" | "tool_call" | "tool_result" | "error" | "done" | "compaction" | "verification"
  text?: string
  toolCall?: { id: string; name: string; args: Record<string, unknown> }
  toolResult?: { id: string; name: string; result: ToolResult }
  error?: Error
  summary?: string
  verification?: { type: string; result: string; evidence: string; todoId: string }
}

export interface AgentResult {
  content: string
  toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number; cachedTokens?: number }
  steps: number
}

export interface ContextCompactionResult {
  history: Message[]
  summary: string
  compressed: boolean
  tokenUsage: {
    total: number
    overhead: number
    recent: number
    summary: number
  }
}

export interface SessionMetadata {
  schemaVersion: string
  sessionId: string
  workspaceId: string
  title?: string
  createdAt: string
  updatedAt: string
  lastMessageAt: string
  messageCount: number
  status: "active" | "archived"
  parentSessionId?: string
}

export interface CommandDefinition {
  name: string
  description: string
  args?: Array<{ name: string; description: string; required: boolean }>
  handler: (args: string[], context: CommandContext) => Promise<string | null> | string | null
}

export interface CommandContext {
  config: AgentConfig
  currentAgentId: string
  sessionId: string
  switchAgent: (agentId: string) => void
  switchModel: (providerId: string, modelId: string) => void
  getAvailableModels: () => Array<{ providerId: string; modelId: string; contextWindow: number; capabilities: Record<string, boolean> }>
  listSessions: () => Array<{ id: string; title?: string; active: boolean }>
  listTools: () => Array<{ name: string; description: string }>
  getSessionTokens: () => { used: number; total: number }
  compactSession: () => Promise<{ compressed: boolean; summary: string; messageCount: number }> | { compressed: boolean; summary: string; messageCount: number }
  clearSession: () => void
  // SubAgent 相关
  listActiveSubAgents: () => Array<{ agentId: string; task: string; status: string }>
  viewSubAgent: (agentId: string) => void
  viewMainAgent: () => void
  viewingAgentId: string | null
}

// --- Config types ---

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

export interface ContextConfig {
  strategy: "summary" | "token-budget" | "none"
  summaryThresholdRatio: number
  recentWindowRatio: number
  summaryMaxTokens: number
}

export interface AgentConfig {
  runtimeRoot: string
  workspaceRoot: string
  workspaceId: string
  providers: Record<string, ProviderConfig>
  defaults: { provider: string; model: string }
  permissions: PermissionRule[]
  skills: { allowlist: string[]; denylist: string[] }
  browser: { enabled: boolean; headless: boolean }
  context: ContextConfig
  sessionsDir: string
  attachmentsDir: string
}
