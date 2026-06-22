import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { execSync } from "node:child_process"
import { loadConfigNew, type AgentConfig } from "./config"
import { loadRules, buildRulesPrompt } from "@myz/agent-core"
import { loadAgentDefinitions, loadBuiltinAgentDefinitions } from "@myz/agent-core"
import { matchCommand, createCommands, type CommandContext } from "@myz/agent-core"
import { compactContext } from "@myz/agent-core"
import { spawnSubagent } from "@myz/agent-core"
import type { Message } from "@myz/agent-providers"
import { createLLMClient, toProviderMessages } from "@myz/agent-providers"
import type { LLMClient } from "@myz/agent-providers"
import { runAgentLoop, createExtensionState, createExtensionAPI } from "@myz/agent-core"
import type { AgentDefinition, AgentEvent, ToolDefinition } from "@myz/agent-core"

// --- Runtime ---

export interface AgentRuntime {
  config: AgentConfig
  client: LLMClient
  state: ReturnType<typeof createExtensionState>
  currentAgentId: string
  sessionId: string
  messages: Message[]
  onEvent: (event: AgentEvent) => void
}

function createSessionId(): string {
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function resolveModel(config: AgentConfig) {
  const pid = config.defaults.provider
  const mid = config.defaults.model
  if (!pid || !mid) return null
  const provider = config.providers[pid]
  if (!provider) return null
  const model = provider.models.find((m) => m.id === mid)
  if (!model) return null
  return { provider, model }
}

function buildSystemPrompt(agentId: string, config: AgentConfig): string {
  const agent = resolveAgent(agentId, config)
  const rules = loadRules(config)
  const rulesPrompt = buildRulesPrompt(rules)
  const sections = [agent?.prompt || "你是 myz agent。", "", "## 工作区", config.workspaceRoot]
  if (rulesPrompt) sections.push("", "## 规则", rulesPrompt)
  sections.push("", "## 工具", "你可以使用 List, Read, Write, Edit, Glob, Run, Task 工具。")
  sections.push("", "## 会话", "- /clear 新建 | /model 切换模型 | /agents 切换 agent")
  return sections.join("\n")
}

function resolveAgent(agentId: string, config: AgentConfig): AgentDefinition {
  const all = [...loadBuiltinAgentDefinitions(), ...loadAgentDefinitions(`${config.workspaceRoot}/.agents/agents`)]
  return all.find((a) => a.id === agentId) || all[0]
}

// --- Tool definitions ---

const TOOL_DEFINITIONS: ToolDefinition[] = [
  { name: "List", description: "列出目录下的文件", inputSchema: { type: "object", properties: { path: { type: "string" } } } },
  { name: "Read", description: "读取文件内容", inputSchema: { type: "object", required: ["path"], properties: { path: { type: "string" } } } },
  { name: "Write", description: "写入文件内容", inputSchema: { type: "object", required: ["path", "content"], properties: { path: { type: "string" }, content: { type: "string" } } } },
  { name: "Edit", description: "替换文件内容", inputSchema: { type: "object", required: ["path", "oldText", "newText"], properties: { path: { type: "string" }, oldText: { type: "string" }, newText: { type: "string" } } } },
  { name: "Glob", description: "按模式匹配文件", inputSchema: { type: "object", required: ["pattern"], properties: { pattern: { type: "string" } } } },
  { name: "Run", description: "执行命令", inputSchema: { type: "object", required: ["command"], properties: { command: { type: "string" } } } },
  { name: "Task", description: "调用子 agent", inputSchema: { type: "object", required: ["agentId", "task"], properties: { agentId: { type: "string" }, task: { type: "string" } } } },
]

function createToolHandlers(workspaceRoot: string, runtime: AgentRuntime) {
  return {
    List: async (args: Record<string, unknown>) => {
      const p = resolve(workspaceRoot, String(args.path || "."))
      if (!existsSync(p)) return { content: [{ type: "text" as const, text: "路径不存在" }], isError: true }
      if (!statSync(p).isDirectory()) return { content: [{ type: "text" as const, text: p }] }
      return { content: [{ type: "text" as const, text: readdirSync(p).join("\n") }] }
    },
    Read: async (args: Record<string, unknown>) => {
      const p = resolve(workspaceRoot, String(args.path || ""))
      if (!existsSync(p)) return { content: [{ type: "text" as const, text: "路径不存在" }], isError: true }
      return { content: [{ type: "text" as const, text: readFileSync(p, "utf-8") }] }
    },
    Write: async (args: Record<string, unknown>) => {
      const p = resolve(workspaceRoot, String(args.path || ""))
      if (!p.startsWith(workspaceRoot)) return { content: [{ type: "text" as const, text: "不允许写入工作区外" }], isError: true }
      mkdirSync(dirname(p), { recursive: true })
      writeFileSync(p, String(args.content || ""))
      return { content: [{ type: "text" as const, text: "写入完成" }] }
    },
    Edit: async (args: Record<string, unknown>) => {
      const p = resolve(workspaceRoot, String(args.path || ""))
      if (!existsSync(p)) return { content: [{ type: "text" as const, text: "文件不存在" }], isError: true }
      let content = readFileSync(p, "utf-8")
      const old = String(args.oldText || "")
      if (!content.includes(old)) return { content: [{ type: "text" as const, text: "未找到 oldText" }], isError: true }
      writeFileSync(p, content.replace(old, String(args.newText || "")))
      return { content: [{ type: "text" as const, text: "替换完成" }] }
    },
    Glob: async (args: Record<string, unknown>) => {
      const pattern = String(args.pattern || "")
      if (!pattern) return { content: [{ type: "text" as const, text: "pattern 必填" }], isError: true }
      try {
        const r = execSync(`find ${workspaceRoot} -type f -name "${pattern}" 2>/dev/null | head -100`, { encoding: "utf-8" })
        return { content: [{ type: "text" as const, text: r || "无匹配文件" }] }
      } catch { return { content: [{ type: "text" as const, text: "无匹配文件" }] } }
    },
    Run: async (args: Record<string, unknown>) => {
      const cmd = String(args.command || "")
      if (!cmd) return { content: [{ type: "text" as const, text: "command 必填" }], isError: true }
      try {
        return { content: [{ type: "text" as const, text: execSync(cmd, { cwd: workspaceRoot, encoding: "utf-8", timeout: 30000, maxBuffer: 1024 * 1024 }) || "(无输出)" }] }
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `命令失败: ${e.message}\n${e.stdout || ""}\n${e.stderr || ""}` }], isError: true }
      }
    },
  }
}

// --- Public API ---

export function createRuntime(options: {
  workspaceRoot?: string
  onEvent?: (event: AgentEvent) => void
}): AgentRuntime {
  const config = loadConfigNew({ workspaceRoot: options.workspaceRoot })
  const resolved = resolveModel(config)
  if (!resolved) throw new Error("未配置 provider/model")

  const client = createLLMClient({
    type: resolved.provider.type as any,
    baseUrl: resolved.provider.baseUrl,
    apiKey: resolved.provider.apiKey,
    profile: resolved.provider.compatProfile as any,
    stream: true,
  })

  const state = createExtensionState()
  const api = createExtensionAPI(state)
  const handlers = createToolHandlers(config.workspaceRoot, {} as AgentRuntime)
  for (const def of TOOL_DEFINITIONS) {
    const handler = handlers[def.name as keyof typeof handlers]
    if (handler) api.registerTool(def, handler as any)
  }

  const runtime: AgentRuntime = {
    config,
    client,
    state,
    currentAgentId: "build",
    sessionId: createSessionId(),
    messages: [],
    onEvent: options.onEvent || (() => {}),
  }

  // Re-register Task handler with runtime reference
  api.registerTool(TOOL_DEFINITIONS[6], async (args) => {
    const subResult = await spawnSubagent({
      agentId: String(args.agentId || "explore"),
      task: String(args.task || ""),
      config: runtime.config,
      client: runtime.client,
      model: runtime.config.defaults.model,
      parentSessionId: runtime.sessionId,
    })
    return { content: [{ type: "text", text: subResult.content || subResult.error || "子 agent 无输出" }] }
  })

  return runtime
}

export async function processUserInput(
  runtime: AgentRuntime,
  input: string,
  options?: { onStreamDelta?: (delta: { content?: string; reasoning?: string }) => void },
): Promise<string> {
  // Slash commands
  const cmd = matchCommand(input)
  if (cmd) {
    const commands = createCommands()
    const handler = commands.find((c) => c.name === cmd.command)
    if (handler) {
      const ctx: CommandContext = {
        config: runtime.config,
        currentAgentId: runtime.currentAgentId,
        sessionId: runtime.sessionId,
        switchAgent: (id) => { runtime.currentAgentId = id },
        switchModel: () => {},
        getAvailableModels: () => Object.entries(runtime.config.providers).flatMap(([pid, p]) =>
          p.models.map((m) => ({ providerId: pid, modelId: m.id, contextWindow: m.contextWindow, capabilities: m.capabilities }))
        ),
        listSessions: () => [{ id: runtime.sessionId, active: true }],
        getSessionTokens: () => ({ used: 0, total: 0 }),
        clearSession: () => { runtime.messages = []; runtime.sessionId = createSessionId() },
      }
      return (await handler.handler(cmd.args, ctx)) || ""
    }
  }

  // Add user message
  runtime.messages.push({ role: "user", content: input })

  // Build context
  const systemPrompt = buildSystemPrompt(runtime.currentAgentId, runtime.config)
  const resolved = resolveModel(runtime.config)
  const contextWindow = resolved?.model.contextWindow || 8192
  const maxOutputTokens = resolved?.model.maxOutputTokens || 4096

  const compacted = await compactContext({
    messages: [{ role: "system", content: systemPrompt }, ...runtime.messages],
    config: runtime.config.context,
    contextWindow,
    maxOutputTokens,
    client: runtime.client,
    model: resolved?.model.id,
    systemPromptTokens: Math.ceil(systemPrompt.length / 4),
    toolsTokens: 1000,
  })

  if (compacted.compressed) runtime.onEvent({ type: "compaction", summary: compacted.summary })

  // Run agent loop via agent-core
  const agent = resolveAgent(runtime.currentAgentId, runtime.config)
  const model = resolved?.model.id || runtime.config.defaults.model
  const llmClient = runtime.client

  const result = await runAgentLoop({
    agent,
    messages: compacted.history,
    state: runtime.state,
    globalPermissions: runtime.config.permissions,
    workspaceRoot: runtime.config.workspaceRoot,
    sessionId: runtime.sessionId,
    onEvent: runtime.onEvent,
    callLLM: async (messages) => {
      const response = await llmClient.complete({
        model,
        messages: toProviderMessages(messages),
        temperature: 0.7,
        max_tokens: maxOutputTokens,
        tools: agent.mode === "primary"
          ? TOOL_DEFINITIONS.map((d) => ({ type: "function" as const, function: { name: d.name, description: d.description, parameters: d.inputSchema } }))
          : undefined,
        onStreamDelta: options?.onStreamDelta,
      })
      return {
        content: response.content || "",
        toolCalls: response.toolCalls?.map((tc) => ({ id: tc.id, name: tc.name, arguments: safeJson(tc.arguments) })),
        usage: response.usage as any,
      }
    },
  })

  if (result.content) runtime.messages.push({ role: "assistant", content: result.content })
  return result.content
}

function safeJson(s: string): Record<string, unknown> {
  try { return JSON.parse(s) } catch { return {} }
}
