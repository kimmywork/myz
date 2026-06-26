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
import { loadTodoState, saveTodoState, addTodo, updateTodoStatus, setTodoVerification, getActiveTask, setActiveTask, getActiveTodosSummary, getTopLevelTodos } from "@myz/agent-core"
import { loadPermissions, savePermissions, addPermissionRule, queryPermission, matchHierarchicalPermission } from "@myz/agent-core"
import type { AgentDefinition, AgentEvent, ToolDefinition } from "@myz/agent-core"
import type { TodoState } from "@myz/agent-core"
import type { PermissionLevel, PermissionMode, PermissionResult } from "@myz/agent-core"

// --- Runtime ---

export interface AgentRuntime {
  config: AgentConfig
  client: LLMClient
  state: ReturnType<typeof createExtensionState>
  currentAgentId: string
  sessionId: string
  messages: Message[]
  tokenUsed: number
  tokenTotal: number
  todoState: TodoState
  permissionLevels: PermissionLevel
  permissionMode: PermissionMode
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

function createClientForCurrentModel(config: AgentConfig): LLMClient {
  const resolved = resolveModel(config)
  if (!resolved) throw new Error("未配置 provider/model")
  return createLLMClient({
    type: resolved.provider.type as any,
    baseUrl: resolved.provider.baseUrl,
    apiKey: resolved.provider.apiKey,
    profile: resolved.provider.compatProfile as any,
    stream: true,
  })
}

function estimateMessageTokens(messages: Message[]) {
  return messages.reduce((sum, message) => sum + Math.ceil(message.content.length / 4) + 4, 0)
}

function buildSystemPrompt(agentId: string, config: AgentConfig, todoState: TodoState, permissionMode: PermissionMode): string {
  const agent = resolveAgent(agentId, config)
  const rules = loadRules(config)
  const rulesPrompt = buildRulesPrompt(rules)
  const sections = [agent?.prompt || "你是 myz agent。", "", "## 工作区", config.workspaceRoot]
  if (rulesPrompt) sections.push("", "## 规则", rulesPrompt)
  sections.push("", "## 工具", "你可以使用 List, Read, Write, Edit, Glob, Run, Task, TodoRead, TodoAdd, TodoUpdate, TodoVerify, QueryPermission 工具。")
  sections.push("", "## 权限模式", `当前权限模式: ${permissionMode}`)
  const todoSummary = getActiveTodosSummary(todoState)
  if (todoSummary) sections.push("", "## 当前任务", todoSummary)
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
  { name: "TodoRead", description: "读取当前任务列表", inputSchema: { type: "object", properties: {} } },
  { name: "TodoAdd", description: "添加新任务", inputSchema: { type: "object", required: ["text"], properties: { text: { type: "string" }, parentId: { type: "string" }, dependsOn: { type: "array", items: { type: "string" } } } } },
  { name: "TodoUpdate", description: "更新任务状态", inputSchema: { type: "object", required: ["id", "status"], properties: { id: { type: "string" }, status: { type: "string", enum: ["pending", "in_progress", "done", "blocked"] } } } },
  { name: "TodoVerify", description: "记录任务验证结果", inputSchema: { type: "object", required: ["id", "type", "result", "evidence"], properties: { id: { type: "string" }, type: { type: "string", enum: ["typecheck", "test", "build", "manual"] }, result: { type: "string", enum: ["pass", "fail", "skip"] }, evidence: { type: "string" } } } },
  { name: "QueryPermission", description: "查询操作权限", inputSchema: { type: "object", required: ["tool"], properties: { tool: { type: "string" }, command: { type: "string" }, path: { type: "string" } } } },
]

function createToolHandlers(workspaceRoot: string, runtime: AgentRuntime) {
  const todoPath = resolve(workspaceRoot, ".myz", "todo.json")
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
    TodoRead: async () => {
      const todos = getTopLevelTodos(runtime.todoState)
      if (todos.length === 0) return { content: [{ type: "text" as const, text: "当前没有任务" }] }
      const lines = todos.map((t) => {
        const status = t.status === "done" ? "✓" : t.status === "in_progress" ? "▸" : t.status === "blocked" ? "✗" : "○"
        const subtasks = runtime.todoState.todos.filter((s) => s.parentId === t.id)
        const subtaskStr = subtasks.length > 0 ? ` (${subtasks.filter((s) => s.status === "done").length}/${subtasks.length})` : ""
        const verification = t.verification ? ` [${t.verification.result}]` : ""
        return `${status} ${t.id}: ${t.text}${subtaskStr}${verification}`
      })
      return { content: [{ type: "text" as const, text: lines.join("\n") }] }
    },
    TodoAdd: async (args: Record<string, unknown>) => {
      const text = String(args.text || "")
      if (!text) return { content: [{ type: "text" as const, text: "text 必填" }], isError: true }
      const parentId = args.parentId ? String(args.parentId) : undefined
      const dependsOn = Array.isArray(args.dependsOn) ? args.dependsOn.map(String) : undefined
      const todo = addTodo(runtime.todoState, text, parentId, dependsOn)
      saveTodoState(todoPath, runtime.todoState)
      return { content: [{ type: "text" as const, text: `已添加任务: ${todo.id}` }] }
    },
    TodoUpdate: async (args: Record<string, unknown>) => {
      const id = String(args.id || "")
      const status = String(args.status || "") as "pending" | "in_progress" | "done" | "blocked"
      if (!id || !status) return { content: [{ type: "text" as const, text: "id 和 status 必填" }], isError: true }
      const todo = updateTodoStatus(runtime.todoState, id, status)
      if (!todo) return { content: [{ type: "text" as const, text: `未找到任务: ${id}` }], isError: true }
      if (status === "in_progress") setActiveTask(runtime.todoState, id)
      else if (status === "done" && getActiveTask(runtime.todoState)?.id === id) setActiveTask(runtime.todoState, undefined)
      saveTodoState(todoPath, runtime.todoState)
      return { content: [{ type: "text" as const, text: `已更新任务: ${id} -> ${status}` }] }
    },
    TodoVerify: async (args: Record<string, unknown>) => {
      const id = String(args.id || "")
      const type = String(args.type || "") as "typecheck" | "test" | "build" | "manual"
      const result = String(args.result || "") as "pass" | "fail" | "skip"
      const evidence = String(args.evidence || "")
      if (!id || !type || !result || !evidence) return { content: [{ type: "text" as const, text: "id, type, result, evidence 必填" }], isError: true }
      const todo = setTodoVerification(runtime.todoState, id, { type, result, evidence })
      if (!todo) return { content: [{ type: "text" as const, text: `未找到任务: ${id}` }], isError: true }
      saveTodoState(todoPath, runtime.todoState)
      return { content: [{ type: "text" as const, text: `已记录验证结果: ${id} -> ${result}` }] }
    },
    QueryPermission: async (args: Record<string, unknown>) => {
      const tool = String(args.tool || "")
      if (!tool) return { content: [{ type: "text" as const, text: "tool 必填" }], isError: true }
      const command = args.command ? String(args.command) : undefined
      const path = args.path ? String(args.path) : undefined
      const context = {
        agent: runtime.currentAgentId,
        tool,
        args: { command, path },
      }
      const result = queryPermission(runtime.permissionLevels, context, runtime.permissionMode)
      const lines = [
        `Result: ${result.result}`,
        result.rule ? `Rule: ${result.rule}` : null,
        result.level ? `Level: ${result.level}` : null,
        result.reason ? `Reason: ${result.reason}` : null,
      ].filter(Boolean)
      return { content: [{ type: "text" as const, text: lines.join("\n") }] }
    },
  }
}

// --- Public API ---

export function createRuntime(options: {
  workspaceRoot?: string
  onEvent?: (event: AgentEvent) => void
}): AgentRuntime {
  const config = loadConfigNew({ workspaceRoot: options.workspaceRoot })
  const client = createClientForCurrentModel(config)

  const state = createExtensionState()
  const api = createExtensionAPI(state)
  const handlers = createToolHandlers(config.workspaceRoot, {} as AgentRuntime)
  for (const def of TOOL_DEFINITIONS) {
    const handler = handlers[def.name as keyof typeof handlers]
    if (handler) api.registerTool(def, handler as any)
  }

  const resolved = resolveModel(config)
  const todoPath = resolve(config.workspaceRoot, ".myz", "todo.json")
  const permissionsPath = resolve(config.workspaceRoot, ".myz", "permissions.json")
  const runtime: AgentRuntime = {
    config,
    client,
    state,
    currentAgentId: "build",
    sessionId: createSessionId(),
    messages: [],
    tokenUsed: 0,
    tokenTotal: resolved?.model.contextWindow || 0,
    todoState: loadTodoState(todoPath),
    permissionLevels: loadPermissions(permissionsPath),
    permissionMode: "auto",
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
        switchModel: (providerId, modelId) => {
          runtime.config.defaults = { provider: providerId, model: modelId }
          runtime.client = createClientForCurrentModel(runtime.config)
          runtime.tokenTotal = resolveModel(runtime.config)?.model.contextWindow || 0
        },
        getAvailableModels: () => Object.entries(runtime.config.providers).flatMap(([pid, p]) =>
          p.models.map((m) => ({ providerId: pid, modelId: m.id, contextWindow: m.contextWindow, capabilities: m.capabilities }))
        ),
        listSessions: () => [{ id: runtime.sessionId, active: true }],
        listTools: () => Array.from(runtime.state.tools.values()).map(({ definition }) => ({
          name: definition.name,
          description: definition.description,
        })),
        getSessionTokens: () => ({ used: runtime.tokenUsed || estimateMessageTokens(runtime.messages), total: runtime.tokenTotal }),
        compactSession: async () => {
          const systemPrompt = buildSystemPrompt(runtime.currentAgentId, runtime.config, runtime.todoState, runtime.permissionMode)
          const resolved = resolveModel(runtime.config)
          const compacted = await compactContext({
            messages: [{ role: "system", content: systemPrompt }, ...runtime.messages],
            config: runtime.config.context,
            contextWindow: resolved?.model.contextWindow || 8192,
            maxOutputTokens: resolved?.model.maxOutputTokens || 4096,
            client: runtime.client,
            model: resolved?.model.id,
            systemPromptTokens: Math.ceil(systemPrompt.length / 4),
            toolsTokens: 1000,
          })
          if (compacted.compressed) {
            runtime.messages = compacted.history.filter((message) => message.role !== "system")
            runtime.onEvent({ type: "compaction", summary: compacted.summary })
          }
          return {
            compressed: compacted.compressed,
            summary: compacted.summary,
            messageCount: runtime.messages.length,
          }
        },
        clearSession: () => { runtime.messages = []; runtime.sessionId = createSessionId(); runtime.tokenUsed = 0 },
      }
      return (await handler.handler(cmd.args, ctx)) || ""
    }
  }

  // Add user message
  runtime.messages.push({ role: "user", content: input })

  // Build context
  const systemPrompt = buildSystemPrompt(runtime.currentAgentId, runtime.config, runtime.todoState, runtime.permissionMode)
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

  if (result.usage?.totalTokens) runtime.tokenUsed = result.usage.totalTokens
  else runtime.tokenUsed = estimateMessageTokens(runtime.messages)
  runtime.tokenTotal = resolved?.model.contextWindow || runtime.tokenTotal

  if (result.content) runtime.messages.push({ role: "assistant", content: result.content })
  return result.content
}

function safeJson(s: string): Record<string, unknown> {
  try { return JSON.parse(s) } catch { return {} }
}
