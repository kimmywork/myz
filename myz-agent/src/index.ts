import { loadRules, buildRulesPrompt } from "@myz/agent-core"
import { loadAgentDefinitions, loadBuiltinAgentDefinitions } from "@myz/agent-core"
import { matchCommand, createCommands, type CommandContext } from "@myz/agent-core"
import { compactContext } from "@myz/agent-core"
import { spawnSubagent } from "@myz/agent-core"
import { runAgentLoop, createExtensionState, createExtensionAPI } from "@myz/agent-core"
import { loadTodoState, saveTodoState, addTodo, updateTodoStatus, setTodoVerification, getActiveTask, setActiveTask, getActiveTodosSummary, getTopLevelTodos } from "@myz/agent-core"
import { loadPermissions, savePermissions, addPermissionRule, queryPermission, matchHierarchicalPermission } from "@myz/agent-core"
import type { AgentDefinition, AgentEvent, ToolDefinition } from "@myz/agent-core"
import type { TodoState } from "@myz/agent-core"
import type { PermissionLevel, PermissionMode, PermissionResult } from "@myz/agent-core"
import { createLLMClient, toProviderMessages } from "@myz/agent-providers"
import type { LLMClient } from "@myz/agent-providers"
import type { Message } from "@myz/agent-providers"
import { BrowserManager, createBrowserTools } from "@myz/agent-web"
import { execSync } from "node:child_process"
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync, appendFileSync } from "node:fs"
import { resolve, dirname, join } from "node:path"
import { loadConfigNew, type AgentConfig } from "./config"

// --- Runtime ---

export interface AgentRuntime {
  config: AgentConfig
  client: LLMClient
  state: ReturnType<typeof createExtensionState>
  currentAgentId: string
  sessionId: string
  messages: Message[]
  tokenUsage: TokenUsage
  tokenTotal: number
  todoState: TodoState
  permissionLevels: PermissionLevel
  permissionMode: PermissionMode
  // SubAgent 状态
  activeSubAgents: Map<string, { agentId: string; task: string; status: "running" | "completed" | "error"; progress?: string }>
  viewingAgentId: string | null
  viewingAgentEntries: Map<string, Array<{ id?: string; role: string; text: string; status?: string }>>
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

// --- Token tracking ---

interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cachedTokens: number
}

function createEmptyTokenUsage(): TokenUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0, cachedTokens: 0 }
}

function addTokenUsage(target: TokenUsage, source: { promptTokens?: number; completionTokens?: number; totalTokens?: number; cachedTokens?: number }): void {
  target.promptTokens += source.promptTokens || 0
  target.completionTokens += source.completionTokens || 0
  target.totalTokens += source.totalTokens || 0
  target.cachedTokens += source.cachedTokens || 0
}

// --- Session management ---

function getSessionsDir(config: AgentConfig): string {
  const dir = resolve(config.runtimeRoot, "workspaces", config.workspaceId, "sessions")
  mkdirSync(dir, { recursive: true })
  return dir
}

function loadSessionHistory(sessionsDir: string, sessionId: string): any[] {
  const file = join(sessionsDir, `${sessionId}.jsonl`)
  if (!existsSync(file)) return []
  try {
    return readFileSync(file, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  } catch { return [] }
}

function appendSessionEntry(sessionsDir: string, sessionId: string, entry: any): void {
  appendFileSync(join(sessionsDir, `${sessionId}.jsonl`), JSON.stringify(entry) + "\n")
}

function listAllSessions(sessionsDir: string): Array<{ id: string; title?: string; active: boolean }> {
  if (!existsSync(sessionsDir)) return []
  const files = readdirSync(sessionsDir).filter((f) => f.endsWith(".jsonl"))
  return files.map((f) => {
    const id = f.replace(".jsonl", "")
    const history = loadSessionHistory(sessionsDir, id)
    const title = history.find((e) => e.role === "user")?.text?.slice(0, 50) || "无标题"
    return { id, title, active: true }
  })
}

function buildSystemPrompt(agentId: string, config: AgentConfig, todoState: TodoState, permissionMode: PermissionMode): string {
  const agent = resolveAgent(agentId, config)
  const rules = loadRules(config)
  const rulesPrompt = buildRulesPrompt(rules)
  const sections = [agent?.prompt || "你是 myz agent。", "", "## 工作区", config.workspaceRoot]
  if (rulesPrompt) sections.push("", "## 规则", rulesPrompt)
  sections.push("", "## 工具", "你可以使用 List, Read, Write, Edit, Glob, Run, SubAgent, TodoRead, TodoAdd, TodoUpdate, TodoVerify, QueryPermission 工具。")
  sections.push("", "## 权限模式", `当前权限模式: ${permissionMode}`)
  const todoSummary = getActiveTodosSummary(todoState)
  if (todoSummary) sections.push("", "## 当前任务", todoSummary)
  return sections.join("\n")
}

function resolveAgent(agentId: string, config: AgentConfig): AgentDefinition {
  const all = [...loadBuiltinAgentDefinitions(), ...loadAgentDefinitions(`${config.workspaceRoot}/.agents/agents`)]
  return all.find((a) => a.id === agentId) || all[0]
}

// --- Tool definitions ---

const TOOL_DEFINITIONS: ToolDefinition[] = [
  { name: "List", description: "列出目录下的文件", inputSchema: { type: "object", properties: { path: { type: "string" } } } },
  { name: "Read", description: "读取文件内容（支持行号范围）", inputSchema: { type: "object", required: ["path"], properties: { path: { type: "string" }, startLine: { type: "integer", description: "起始行号（从 1 开始）" }, endLine: { type: "integer", description: "结束行号" } } } },
  { name: "Write", description: "写入文件内容", inputSchema: { type: "object", required: ["path", "content"], properties: { path: { type: "string" }, content: { type: "string" } } } },
  { name: "Edit", description: "替换文件内容", inputSchema: { type: "object", required: ["path", "oldText", "newText"], properties: { path: { type: "string" }, oldText: { type: "string" }, newText: { type: "string" } } } },
  { name: "Glob", description: "按模式匹配文件", inputSchema: { type: "object", required: ["pattern"], properties: { pattern: { type: "string" } } } },
  { name: "Run", description: "执行命令", inputSchema: { type: "object", required: ["command"], properties: { command: { type: "string" } } } },
  { name: "SubAgent", description: "调用或创建子 agent", inputSchema: { type: "object", required: ["task"], properties: { agentId: { type: "string" }, task: { type: "string" }, prompt: { type: "string" }, model: { type: "string" }, tools: { type: "array", items: { type: "string" } } } } },
  { name: "TodoRead", description: "读取当前任务列表", inputSchema: { type: "object", properties: {} } },
  { name: "TodoAdd", description: "添加新任务", inputSchema: { type: "object", required: ["text"], properties: { text: { type: "string" }, parentId: { type: "string" }, dependsOn: { type: "array", items: { type: "string" } } } } },
  { name: "TodoUpdate", description: "更新任务状态", inputSchema: { type: "object", required: ["id", "status"], properties: { id: { type: "string" }, status: { type: "string", enum: ["pending", "in_progress", "done", "blocked"] } } } },
  { name: "TodoVerify", description: "记录任务验证结果", inputSchema: { type: "object", required: ["id", "type", "result", "evidence"], properties: { id: { type: "string" }, type: { type: "string", enum: ["typecheck", "test", "build", "manual"] }, result: { type: "string", enum: ["pass", "fail", "skip"] }, evidence: { type: "string" } } } },
  { name: "QueryPermission", description: "查询操作权限", inputSchema: { type: "object", required: ["tool"], properties: { tool: { type: "string" }, command: { type: "string" }, path: { type: "string" } } } },
  { name: "EnterPlanMode", description: "进入规划模式（只读）", inputSchema: { type: "object", properties: {} } },
  { name: "ExitPlanMode", description: "退出规划模式", inputSchema: { type: "object", properties: {} } },
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
      const startLine = args.startLine ? Number(args.startLine) : undefined
      const endLine = args.endLine ? Number(args.endLine) : undefined
      try {
        const stat = statSync(p)
        if (stat.isSymbolicLink()) {
          const realPath = require("node:fs").realpathSync(p)
          const content = readFileSync(realPath, "utf-8")
          if (startLine || endLine) {
            const lines = content.split("\n")
            const start = Math.max(0, (startLine || 1) - 1)
            const end = endLine ? Math.min(lines.length, endLine) : lines.length
            return { content: [{ type: "text" as const, text: lines.slice(start, end).join("\n") }] }
          }
          return { content: [{ type: "text" as const, text: content }] }
        }
        const content = readFileSync(p, "utf-8")
        if (startLine || endLine) {
          const lines = content.split("\n")
          const start = Math.max(0, (startLine || 1) - 1)
          const end = endLine ? Math.min(lines.length, endLine) : lines.length
          return { content: [{ type: "text" as const, text: lines.slice(start, end).join("\n") }] }
        }
        return { content: [{ type: "text" as const, text: content }] }
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `读取失败: ${e.message}` }], isError: true }
      }
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
        const r = execSync(`find ${workspaceRoot} -type f -name "${pattern}" 2>/dev/null`, { encoding: "utf-8" })
        const lines = r.split("\n").filter(Boolean)
        const lineCount = lines.length
        const sizeKb = Math.ceil(Buffer.byteLength(r, "utf-8") / 1024)
        
        // 如果输出超过 5KB，保存到临时文件
        if (sizeKb > 5) {
          const tmpFile = resolve(workspaceRoot, ".myz", `tmp-glob-${Date.now()}.txt`)
          mkdirSync(dirname(tmpFile), { recursive: true })
          writeFileSync(tmpFile, lines.join("\n"))
          return { content: [{ type: "text" as const, text: `Found ${lineCount} files (${sizeKb}KB). Output saved to: ${tmpFile}\nUse Read(path, startLine, endLine) to read specific lines.` }] }
        }
        
        return { content: [{ type: "text" as const, text: r || "无匹配文件" }] }
      } catch { return { content: [{ type: "text" as const, text: "无匹配文件" }] } }
    },
    Run: async (args: Record<string, unknown>) => {
      const cmd = String(args.command || "")
      if (!cmd) return { content: [{ type: "text" as const, text: "command 必填" }], isError: true }
      try {
        const output = execSync(cmd, { cwd: workspaceRoot, encoding: "utf-8", timeout: 30000, maxBuffer: 10 * 1024 * 1024 }) || ""
        const lines = output.split("\n")
        const lineCount = lines.length
        const sizeKb = Math.ceil(Buffer.byteLength(output, "utf-8") / 1024)
        
        // 如果输出超过 5KB，保存到临时文件
        if (sizeKb > 5) {
          const tmpFile = resolve(workspaceRoot, ".myz", `tmp-run-${Date.now()}.txt`)
          mkdirSync(dirname(tmpFile), { recursive: true })
          writeFileSync(tmpFile, output)
          return { content: [{ type: "text" as const, text: `Output: ${lineCount} lines, ${sizeKb}KB. Saved to: ${tmpFile}\nUse Read(path, startLine, endLine) to read specific lines.` }] }
        }
        
        return { content: [{ type: "text" as const, text: output || "(无输出)" }] }
      } catch (e: any) {
        const stdout = e.stdout || ""
        const stderr = e.stderr || ""
        const output = `命令失败: ${e.message}\n${stdout}\n${stderr}`
        const sizeKb = Math.ceil(Buffer.byteLength(output, "utf-8") / 1024)
        
        // 如果输出超过 5KB，保存到临时文件
        if (sizeKb > 5) {
          const tmpFile = resolve(workspaceRoot, ".myz", `tmp-run-error-${Date.now()}.txt`)
          mkdirSync(dirname(tmpFile), { recursive: true })
          writeFileSync(tmpFile, output)
          return { content: [{ type: "text" as const, text: `Error output: ${sizeKb}KB. Saved to: ${tmpFile}\nUse Read(path, startLine, endLine) to read specific lines.` }], isError: true }
        }
        
        return { content: [{ type: "text" as const, text: output }], isError: true }
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
      
      // 发出 verification 事件
      runtime.onEvent({
        type: "verification",
        text: `${type}: ${result}`,
        verification: { type, result, evidence, todoId: id },
      })
      
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
    EnterPlanMode: async () => {
      runtime.permissionMode = "readonly"
      runtime.currentAgentId = "plan"
      return { content: [{ type: "text" as const, text: "已进入规划模式（只读）" }] }
    },
    ExitPlanMode: async () => {
      runtime.permissionMode = "auto"
      runtime.currentAgentId = "main"
      return { content: [{ type: "text" as const, text: "已退出规划模式" }] }
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

  // 初始化 BrowserManager 并注册 browser 工具
  const browserManager = new BrowserManager({ headless: true })
  const browserTools = createBrowserTools({ browserManager })
  for (const def of browserTools.definitions) {
    const handler = browserTools.handlers[def.name]
    if (handler) api.registerTool(def, handler as any)
  }

  const resolved = resolveModel(config)
  const todoPath = resolve(config.workspaceRoot, ".myz", "todo.json")
  const permissionsPath = resolve(config.workspaceRoot, ".myz", "permissions.json")
  const runtime: AgentRuntime = {
    config,
    client,
    state,
    currentAgentId: "main",
    sessionId: createSessionId(),
    messages: [],
    tokenUsage: createEmptyTokenUsage(),
    tokenTotal: resolved?.model.contextWindow || 0,
    todoState: loadTodoState(todoPath),
    permissionLevels: loadPermissions(permissionsPath),
    permissionMode: "auto",
    activeSubAgents: new Map(),
    viewingAgentId: null,
    viewingAgentEntries: new Map(),
    onEvent: options.onEvent || (() => {}),
  }

  // Re-register SubAgent handler with runtime reference
  api.registerTool(TOOL_DEFINITIONS[6], async (args) => {
    const agentId = String(args.agentId || "")
    const task = String(args.task || "")
    const prompt = String(args.prompt || "")
    const model = String(args.model || "")
    const tools = Array.isArray(args.tools) ? args.tools.map(String) : []

    // 模式 1：调用预定义 Agent
    if (agentId) {
      // 更新 SubAgent 状态
      runtime.activeSubAgents.set(agentId, {
        agentId,
        task,
        status: "running",
      })

      const subResult = await spawnSubagent({
        agentId,
        task,
        config: runtime.config,
        client: runtime.client,
        model: runtime.config.defaults.model,
        parentSessionId: runtime.sessionId,
        tools: runtime.state.tools,
        onEvent: (event) => {
          // 更新 SubAgent 进度
          const current = runtime.activeSubAgents.get(agentId)
          if (current) {
            current.progress = event.text
            runtime.activeSubAgents.set(agentId, current)
          }
          
          // 将 SubAgent 事件转发到主 runtime 的 onEvent
          runtime.onEvent({
            type: event.type === "complete" ? "text" : "tool_call",
            text: event.text,
            toolCall: event.toolCall,
          })
        },
      })

      // 更新 SubAgent 最终状态
      const finalStatus = subResult.error ? "error" : "completed"
      runtime.activeSubAgents.set(agentId, {
        agentId,
        task,
        status: finalStatus,
      })

      return { content: [{ type: "text", text: subResult.content || subResult.error || "子 agent 无输出" }] }
    }

    // 模式 2：创建临时 SubAgent
    if (!prompt) return { content: [{ type: "text", text: "必须提供 agentId 或 prompt" }], isError: true }
    if (!task) return { content: [{ type: "text", text: "必须提供 task" }], isError: true }

    const tempAgentId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const tempAgent = {
      id: tempAgentId,
      description: "临时 SubAgent",
      mode: "subagent" as const,
      model: model || undefined,
      tools: tools.length > 0 ? tools : undefined,
      permissions: [{ pattern: "*", action: "allow" as const }],
      prompt,
    }

    // 更新 SubAgent 状态
    runtime.activeSubAgents.set(tempAgentId, {
      agentId: tempAgentId,
      task,
      status: "running",
    })

    const subResult = await spawnSubagent({
      agentId: tempAgentId,
      task,
      config: runtime.config,
      client: runtime.client,
      model: model || runtime.config.defaults.model,
      parentSessionId: runtime.sessionId,
      tools: runtime.state.tools,
      agent: tempAgent,
      onEvent: (event) => {
        // 更新 SubAgent 进度
        const current = runtime.activeSubAgents.get(tempAgentId)
        if (current) {
          current.progress = event.text
          runtime.activeSubAgents.set(tempAgentId, current)
        }
        
        // 将 SubAgent 事件转发到主 runtime 的 onEvent
        runtime.onEvent({
          type: event.type === "complete" ? "text" : "tool_call",
          text: event.text,
          toolCall: event.toolCall,
        })
      },
    })

    // 更新 SubAgent 最终状态
    const finalStatus = subResult.error ? "error" : "completed"
    runtime.activeSubAgents.set(tempAgentId, {
      agentId: tempAgentId,
      task,
      status: finalStatus,
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
        listSessions: () => {
          const sessionsDir = getSessionsDir(runtime.config)
          return listAllSessions(sessionsDir)
        },
        resumeSession: (sessionId: string) => {
          const sessionsDir = getSessionsDir(runtime.config)
          const history = loadSessionHistory(sessionsDir, sessionId)
          runtime.sessionId = sessionId
          runtime.messages = history.filter((e) => e.role === "user" || e.role === "assistant").map((e) => ({
            role: e.role,
            content: e.text,
          }))
          runtime.tokenUsage = createEmptyTokenUsage()
        },
        listTools: () => Array.from(runtime.state.tools.values()).map(({ definition }) => ({
          name: definition.name,
          description: definition.description,
        })),
        getSessionTokens: () => ({ used: runtime.tokenUsage.totalTokens, total: runtime.tokenTotal }),
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
        clearSession: () => { runtime.messages = []; runtime.sessionId = createSessionId(); runtime.tokenUsage = createEmptyTokenUsage() },
        // 权限模式
        getPermissionMode: () => runtime.permissionMode,
        setPermissionMode: (mode) => { runtime.permissionMode = mode },
        // SubAgent 相关
        listActiveSubAgents: () => {
          return Array.from(runtime.activeSubAgents.values()).map((sa) => ({
            agentId: sa.agentId,
            task: sa.task,
            status: sa.status,
          }))
        },
        viewSubAgent: (agentId: string) => {
          runtime.viewingAgentId = agentId
        },
        viewMainAgent: () => {
          runtime.viewingAgentId = null
        },
        viewingAgentId: runtime.viewingAgentId,
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
    permissionLevels: runtime.permissionLevels,
    permissionMode: runtime.permissionMode,
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

  // 更新 token 统计
  if (result.usage) {
    addTokenUsage(runtime.tokenUsage, result.usage)
  }
  runtime.tokenTotal = resolved?.model.contextWindow || runtime.tokenTotal

  if (result.content) runtime.messages.push({ role: "assistant", content: result.content })
  return result.content
}

function safeJson(s: string): Record<string, unknown> {
  try { return JSON.parse(s) } catch { return {} }
}
