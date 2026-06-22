import type { AgentDefinition, AgentResult } from "@myz/agent-core"
import type { Message, LLMClient } from "@myz/agent-providers"
import type { AgentConfig } from "./types"
import { loadAgentDefinitions, loadBuiltinAgentDefinitions } from "@myz/agent-core"

export interface SubagentSpawnOptions {
  agentId: string
  task: string
  config: AgentConfig
  client: LLMClient
  model: string
  parentSessionId: string
}

export interface SubagentResult {
  agentId: string
  content: string
  steps: number
  error?: string
}

function resolveAgent(agentId: string, config: AgentConfig): AgentDefinition | null {
  const builtin = loadBuiltinAgentDefinitions()
  const custom = loadAgentDefinitions(`${config.workspaceRoot}/.agents/agents`)
  const all = [...builtin, ...custom]
  return all.find((a) => a.id === agentId) || null
}

export async function spawnSubagent(
  options: SubagentSpawnOptions,
): Promise<SubagentResult> {
  const { agentId, task, config, client, model, parentSessionId } = options

  const agent = resolveAgent(agentId, config)
  if (!agent) {
    return { agentId, content: "", steps: 0, error: `Unknown agent: ${agentId}` }
  }

  if (agent.mode !== "subagent") {
    return { agentId, content: "", steps: 0, error: `Agent ${agentId} is not a subagent` }
  }

  const messages: Message[] = [
    { role: "system", content: agent.prompt },
    { role: "user", content: task },
  ]

  const maxSteps = agent.maxSteps || 20
  let steps = 0
  const allToolCalls: Array<{ name: string; args: Record<string, unknown> }> = []

  while (steps < maxSteps) {
    steps++

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
        allToolCalls.push({ name: tc.name, args: safeJson(tc.arguments) })

        let resultText = ""
        if (agent.permissions.some((p) => p.action === "deny" && (p.pattern === "*" || p.pattern === tc.name))) {
          resultText = `Permission denied: ${tc.name}`
        } else {
          resultText = `[Tool ${tc.name} not available in subagent mode]`
        }

        messages.push({
          role: "tool",
          content: resultText,
          tool_call_id: tc.id,
        })
      }
    } else {
      return {
        agentId,
        content: response.content,
        steps,
      }
    }
  }

  return {
    agentId,
    content: "",
    steps,
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

  const lines = subagents.map((a) => `- ${a.id}: ${a.description}`)
  return [
    "你可以通过 Task 工具调用子 agent 来处理特定任务。",
    "可用子 agent：",
    ...lines,
    "",
    "用法：调用 Task 工具，传入 agentId 和 task 描述。",
  ].join("\n")
}
