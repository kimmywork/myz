import type { Message } from "@myz/agent-providers"
import type { ExtensionState } from "./extensions"
import { emitHooks } from "./extensions"
import { matchPermission, matchHierarchicalPermission } from "./permissions"
import type { PermissionLevel, PermissionMode } from "./permissions"
import type {
  AgentDefinition,
  AgentEvent,
  AgentResult,
  ToolResult,
} from "./types"

export interface AgentLoopOptions {
  agent: AgentDefinition
  messages: Message[]
  state: ExtensionState
  globalPermissions: Array<{ pattern: string; action: "allow" | "ask" | "deny" }>
  permissionLevels?: PermissionLevel
  permissionMode?: PermissionMode
  workspaceRoot: string
  sessionId: string
  onEvent?: (event: AgentEvent) => void | Promise<void>
  callLLM: (messages: Message[]) => Promise<{
    content: string
    toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number; cachedTokens?: number }
  }>
}

function createToolResultMessage(
  toolCallId: string,
  result: ToolResult,
): Message {
  const content = result.content.map((c) => {
    if (c.type === "text") return c.text
    if (c.type === "image") return `[Image: ${c.mimeType}]`
    return ""
  }).join("\n")

  return {
    role: "tool" as const,
    tool_call_id: toolCallId,
    content,
    metadata: { isError: result.isError },
  }
}

function createAssistantMessage(
  content: string,
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
): Message {
  const msg: Message = {
    role: "assistant" as const,
    content,
  }
  if (toolCalls && toolCalls.length > 0) {
    msg.tool_calls = toolCalls.map((tc) => ({
      id: tc.id,
      type: "function" as const,
      function: {
        name: tc.name,
        arguments: JSON.stringify(tc.arguments),
      },
    }))
  }
  return msg
}

export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentResult> {
  const {
    agent,
    messages: initialMessages,
    state,
    globalPermissions,
    permissionLevels,
    permissionMode = "auto",
    workspaceRoot,
    sessionId,
    onEvent,
    callLLM,
  } = options

  const messages = [...initialMessages]
  const allToolCalls: AgentResult["toolCalls"] = []
  let steps = 0
  const maxSteps = agent.maxSteps || 50
  const totalUsage: AgentResult["usage"] = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

  while (steps < maxSteps) {
    steps++

    const response = await callLLM(messages)
    
    // 累加 usage
    if (response.usage) {
      totalUsage.promptTokens += response.usage.promptTokens || 0
      totalUsage.completionTokens += response.usage.completionTokens || 0
      totalUsage.totalTokens += response.usage.totalTokens || 0
    }

    if (response.toolCalls && response.toolCalls.length > 0) {
      const assistantMsg = createAssistantMessage(response.content, response.toolCalls)
      messages.push(assistantMsg)

      if (response.content) {
        await onEvent?.({ type: "text", text: response.content })
      }

      for (const toolCall of response.toolCalls) {
        allToolCalls.push({
          id: toolCall.id,
          name: toolCall.name,
          args: toolCall.arguments,
        })

        await onEvent?.({
          type: "tool_call",
          toolCall: { id: toolCall.id, name: toolCall.name, args: toolCall.arguments },
        })

        await emitHooks(state, "pre_tool_call", {
          type: "pre_tool_call",
          agentId: agent.id,
          sessionId,
          tool: toolCall.name,
          args: toolCall.arguments,
        })

        // 使用分级权限检查
        let permission: "allow" | "ask" | "deny" = "allow"
        if (permissionLevels) {
          const result = matchHierarchicalPermission(
            permissionLevels,
            { agent: agent.id, tool: toolCall.name, args: toolCall.arguments },
            permissionMode,
          )
          permission = result.result === "auto" ? "ask" : result.result
        } else {
          permission = matchPermission(
            globalPermissions,
            { agent: agent.id, tool: toolCall.name, args: toolCall.arguments },
            agent.permissions,
          )
        }

        let result: ToolResult
        if (permission === "deny") {
          result = {
            content: [{ type: "text", text: `Permission denied: ${toolCall.name}` }],
            isError: true,
          }
        } else if (permission === "ask") {
          result = {
            content: [{ type: "text", text: `Permission required: ${toolCall.name}` }],
            isError: true,
          }
        } else {
          const toolEntry = state.tools.get(toolCall.name)
          if (!toolEntry) {
            result = {
              content: [{ type: "text", text: `Unknown tool: ${toolCall.name}` }],
              isError: true,
            }
          } else {
            try {
              result = await toolEntry.handler(toolCall.arguments, {
                agentId: agent.id,
                sessionId,
                workspaceRoot,
              })
            } catch (error) {
              result = {
                content: [{ type: "text", text: `Tool error: ${(error as Error).message}` }],
                isError: true,
              }
            }
          }
        }

        await emitHooks(state, "post_tool_call", {
          type: "post_tool_call",
          agentId: agent.id,
          sessionId,
          tool: toolCall.name,
          args: toolCall.arguments,
          result,
        })

        await onEvent?.({
          type: "tool_result",
          toolResult: { id: toolCall.id, name: toolCall.name, result },
        })

        messages.push(createToolResultMessage(toolCall.id, result))
      }
    } else {
      if (response.content) {
        await onEvent?.({ type: "text", text: response.content })
      }
      messages.push(createAssistantMessage(response.content))

      await onEvent?.({ type: "done" })

      return {
        content: response.content,
        toolCalls: allToolCalls,
        usage: totalUsage,
        steps,
      }
    }
  }

  await onEvent?.({
    type: "error",
    error: new Error(`Max steps (${maxSteps}) exceeded`),
  })

  return {
    content: "",
    toolCalls: allToolCalls,
    usage: totalUsage,
    steps,
  }
}
