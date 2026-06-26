import type { AgentDefinition, AgentResult, ToolDefinition, ToolHandler, ToolResult } from "./types"
import type { Message, LLMClient } from "@myz/agent-providers"
import type { AgentConfig } from "./types"
import { loadAgentDefinitions, loadBuiltinAgentDefinitions } from "./agents"
import { matchPermission } from "./permissions"

export interface SubagentSpawnOptions {
  agentId: string
  task: string
  config: AgentConfig
  client: LLMClient
  model: string
  parentSessionId: string
  tools?: Map<string, { definition: ToolDefinition; handler: ToolHandler }>  // Parent 决定的工具
  agent?: AgentDefinition  // 临时 Agent（如果提供，不从配置加载）
  onEvent?: (event: SubagentEvent) => void
}

export interface SubagentEvent {
  type: "start" | "progress" | "tool_call" | "tool_result" | "complete" | "error"
  agentId: string
  text?: string
  toolCall?: { id: string; name: string; args: Record<string, unknown> }
  toolResult?: { id: string; name: string; result: ToolResult }
  error?: string
}

export interface SubagentResult {
  agentId: string
  content: string
  steps: number
  toolCalls: Array<{ name: string; args: Record<string, unknown>; result?: ToolResult }>
  events: SubagentEvent[]
  error?: string
}

function resolveAgent(agentId: string, config: AgentConfig): AgentDefinition | null {
  const builtin = loadBuiltinAgentDefinitions()
  const custom = loadAgentDefinitions(`${config.workspaceRoot}/.agents/agents`)
  const all = [...builtin, ...custom]
  return all.find((a) => a.id === agentId) || null
}

function resolveTools(
  agent: AgentDefinition,
  parentTools?: Map<string, { definition: ToolDefinition; handler: ToolHandler }>,
): Map<string, { definition: ToolDefinition; handler: ToolHandler }> {
  const resolved = new Map<string, { definition: ToolDefinition; handler: ToolHandler }>()

  // 如果 Agent 定义了 tools，只使用这些工具
  if (agent.tools && agent.tools.length > 0 && parentTools) {
    for (const toolPattern of agent.tools) {
      // 解析 Tool(pattern) 格式
      const match = toolPattern.match(/^(\w+)(?:\(.*\))?$/)
      if (match) {
        const toolName = match[1]
        const tool = parentTools.get(toolName)
        if (tool) {
          resolved.set(toolName, tool)
        }
      } else {
        // 简单工具名
        const tool = parentTools.get(toolPattern)
        if (tool) {
          resolved.set(toolPattern, tool)
        }
      }
    }
    return resolved
  }

  // 如果 Agent 没有定义 tools，使用 Parent 提供的工具
  if (parentTools) {
    return parentTools
  }

  return resolved
}

export async function spawnSubagent(
  options: SubagentSpawnOptions,
): Promise<SubagentResult> {
  const { agentId, task, config, client, model, parentSessionId, tools: parentTools, agent: tempAgent, onEvent } = options

  // 使用临时 Agent 或从配置加载
  const agent = tempAgent || resolveAgent(agentId, config)
  if (!agent) {
    return { agentId, content: "", steps: 0, toolCalls: [], events: [], error: `Unknown agent: ${agentId}` }
  }

  if (agent.mode !== "subagent") {
    return { agentId, content: "", steps: 0, toolCalls: [], events: [], error: `Agent ${agentId} is not a subagent` }
  }

  // 解析 SubAgent 可用的工具
  const availableTools = resolveTools(agent, parentTools)

  // 发送 start 事件
  onEvent?.({ type: "start", agentId, text: `SubAgent ${agentId} started` })

  const messages: Message[] = [
    { role: "system", content: agent.prompt },
    { role: "user", content: task },
  ]

  const maxSteps = agent.maxSteps === 0 ? Infinity : (agent.maxSteps || 20)
  let steps = 0
  const allToolCalls: Array<{ name: string; args: Record<string, unknown>; result?: ToolResult }> = []
  const allEvents: SubagentEvent[] = []

  while (steps < maxSteps) {
    steps++

    // 发送 progress 事件
    const progressText = maxSteps === Infinity ? `Step ${steps}` : `Step ${steps}/${maxSteps}`
    onEvent?.({ type: "progress", agentId, text: progressText })

    const response = await client.complete({
      model: agent.model || model,
      messages,
      temperature: 0.3,
      max_tokens: 4096,
    })

    if (response.toolCalls && response.toolCalls.length > 0) {
      messages.push({
        role: "assistant",
        content: response.content,
        tool_calls: response.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: tc.arguments },
        })),
      })

      for (const tc of response.toolCalls) {
        const toolCallEvent: SubagentEvent = {
          type: "tool_call",
          agentId,
          toolCall: { id: tc.id, name: tc.name, args: safeJson(tc.arguments) },
        }
        allEvents.push(toolCallEvent)
        onEvent?.(toolCallEvent)

        let result: ToolResult

        // 检查权限
        const permission = matchPermission(
          agent.permissions,
          { agent: agentId, tool: tc.name, args: safeJson(tc.arguments) },
        )

        if (permission === "deny") {
          result = {
            content: [{ type: "text", text: `Permission denied: ${tc.name}` }],
            isError: true,
          }
        } else {
          // 检查工具是否可用
          const tool = availableTools.get(tc.name)
          if (!tool) {
            result = {
              content: [{ type: "text", text: `Tool ${tc.name} not available for this agent` }],
              isError: true,
            }
          } else {
            try {
              result = await tool.handler(safeJson(tc.arguments), {
                agentId,
                sessionId: parentSessionId,
                workspaceRoot: config.workspaceRoot,
              })
            } catch (error) {
              result = {
                content: [{ type: "text", text: `Tool error: ${(error as Error).message}` }],
                isError: true,
              }
            }
          }
        }

        allToolCalls.push({ name: tc.name, args: safeJson(tc.arguments), result })

        const toolResultEvent: SubagentEvent = {
          type: "tool_result",
          agentId,
          toolResult: { id: tc.id, name: tc.name, result },
        }
        allEvents.push(toolResultEvent)
        onEvent?.(toolResultEvent)

        const content = result.content.map((c) => {
          if (c.type === "text") return c.text
          if (c.type === "image") return `[Image: ${c.mimeType}]`
          return ""
        }).join("\n")

        messages.push({
          role: "tool",
          content,
          tool_call_id: tc.id,
        })
      }
    } else {
      const completeEvent: SubagentEvent = {
        type: "complete",
        agentId,
        text: response.content,
      }
      allEvents.push(completeEvent)
      onEvent?.(completeEvent)

      return {
        agentId,
        content: response.content,
        steps,
        toolCalls: allToolCalls,
        events: allEvents,
      }
    }
  }

  const errorEvent: SubagentEvent = {
    type: "error",
    agentId,
    error: `Max steps (${maxSteps}) exceeded`,
  }
  allEvents.push(errorEvent)
  onEvent?.(errorEvent)

  return {
    agentId,
    content: "",
    steps,
    toolCalls: allToolCalls,
    events: allEvents,
    error: `Max steps (${maxSteps}) exceeded`,
  }
}

function safeJson(s: string): Record<string, unknown> {
  try { return JSON.parse(s) } catch { return {} }
}

export function buildTaskToolDescription(config: AgentConfig): string {
  const agents = [...loadBuiltinAgentDefinitions(), ...loadAgentDefinitions(`${config.workspaceRoot}/.agents/agents`)]
  const subagents = agents.filter((a) => a.mode === "subagent" && !a.hidden)
  if (!subagents.length) return "No subagents available."

  const lines = subagents.map((a) => {
    const tools = a.tools ? ` [${a.tools.join(", ")}]` : ""
    return `- ${a.id}: ${a.description}${tools}`
  })
  return [
    "你可以通过 Task 工具调用子 agent 来处理特定任务。",
    "可用子 agent：",
    ...lines,
    "",
    "用法：调用 Task 工具，传入 agentId 和 task 描述。",
  ].join("\n")
}
