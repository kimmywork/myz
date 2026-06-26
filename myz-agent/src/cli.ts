import { Command } from "commander"
import { loadConfigNew } from "./config"
import { createRuntime, processUserInput } from "./index"
import type { AgentEvent } from "@myz/agent-core"
import { getActiveTodosSummary } from "@myz/agent-core"
import type { ChatEntry } from "@myz/agent-tui"
import { mkdirSync, appendFileSync, existsSync, readFileSync } from "node:fs"
import { resolve, join } from "node:path"
import { homedir } from "node:os"

// --- Session persistence ---

function getSessionsDir(runtimeRoot: string, workspaceId: string) {
  const dir = resolve(runtimeRoot, "workspaces", workspaceId, "sessions")
  mkdirSync(dir, { recursive: true })
  return dir
}

function loadSessionHistory(sessionsDir: string, sessionId: string): ChatEntry[] {
  const file = join(sessionsDir, `${sessionId}.jsonl`)
  if (!existsSync(file)) return []
  try {
    return readFileSync(file, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  } catch { return [] }
}

function appendSessionEntry(sessionsDir: string, sessionId: string, entry: ChatEntry) {
  appendFileSync(join(sessionsDir, `${sessionId}.jsonl`), JSON.stringify(entry) + "\n")
}

// --- CLI ---

const program = new Command()

program
  .name("myz-agent")
  .description("myz-agent — AI coding agent for the terminal")
  .option("-w, --workspace <path>", "Workspace path")

program
  .command("serve", { isDefault: true })
  .description("Start the agent")
  .option("-w, --workspace <path>", "Workspace path")
  .option("--no-tui", "Headless mode (stdin/stdout)")
  .action(async (options: { workspace?: string; tui?: boolean }) => {
    const workspaceRoot = options.workspace
    const config = loadConfigNew({ workspaceRoot })
    const sessionsDir = getSessionsDir(resolve(homedir(), ".myz"), config.workspaceId)

    if (options.tui === false) {
      // Headless mode
      const runtime = createRuntime({
        workspaceRoot,
        onEvent: (event) => {
          if (event.type === "text" && event.text) process.stdout.write(`\nAI: ${event.text}\n`)
          if (event.type === "tool_call" && event.toolCall) process.stdout.write(`\n  ▸ ${event.toolCall.name}\n`)
          if (event.type === "tool_result" && event.toolResult) {
            const r = event.toolResult.result as any
            const text = r?.content?.map?.((c: any) => c.text || "")?.join?.("\n") || ""
            process.stdout.write(`  ${event.toolResult.name} → ${text.slice(0, 200)}\n`)
          }
          if (event.type === "error" && event.error) process.stderr.write(`\nError: ${event.error.message}\n`)
        },
      })

      const readline = await import("node:readline")
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      const prompt = () => {
        rl.question("> ", async (input) => {
          if (!input.trim()) { prompt(); return }
          if (input.trim() === "/exit") { rl.close(); process.exit(0) }
          try {
            appendSessionEntry(sessionsDir, runtime.sessionId, { role: "user", text: input.trim() })
            const reply = await processUserInput(runtime, input.trim())
            console.log(reply)
            if (reply) appendSessionEntry(sessionsDir, runtime.sessionId, { role: "assistant", text: reply })
          } catch (e) {
            console.error("Error:", (e as Error).message)
            appendSessionEntry(sessionsDir, runtime.sessionId, { role: "error", text: (e as Error).message })
          }
          prompt()
        })
      }
      prompt()
    } else {
      // TUI mode — use Ink
      const { render } = await import("ink")
      const { AgentShell } = await import("@myz/agent-tui")
      const React = await import("react")

      const appendEntryRef = React.createRef<(entry: ChatEntry, options?: { persist?: boolean }) => string>()
      const patchEntryRef = React.createRef<(id: string, patch: Partial<ChatEntry>) => void>()
      const appendAssistantDeltaRef = React.createRef<(text: string) => void>()
      const setAssistantCompleteRef = React.createRef<(text: string) => void>()
      const appendReasoningDeltaRef = React.createRef<(text: string) => void>()
      const finishTurnRef = React.createRef<(result: string) => void>()
      const removeEntryRef = React.createRef<(id: string) => void>()
      const toolEntryIds = new Map<string, string>()
      const toolCallArgs = new Map<string, Record<string, unknown>>()

      const createEntryId = (role: string) => `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const formatJson = (value: unknown) => JSON.stringify(value, null, 2)
      const normalizeTranscriptText = (text: string) => text.replace(/\s+/g, " ").trim()
      const summarizeReasoning = (text: string) => {
        const compact = normalizeTranscriptText(text)
        if (!compact) return "Thinking complete"
        return compact.length > 140 ? `Thinking: ${compact.slice(0, 140)}…` : `Thinking: ${compact}`
      }
      const isDuplicateReasoningContent = (reasoning: string, content: string) => {
        const r = normalizeTranscriptText(reasoning)
        const c = normalizeTranscriptText(content)
        if (!r || !c) return false
        return r === c || (r.length >= 40 && c.includes(r)) || (c.length >= 40 && r.includes(c))
      }
      const formatToolResult = (event: NonNullable<AgentEvent["toolResult"]>) => {
        const resultText = event.result.content.map((item) => item.text).join("\n")
        const args = toolCallArgs.get(event.id)
        return [
          args ? `Arguments:\n${formatJson(args)}` : "Arguments: {}",
          "",
          `Result:\n${resultText || "(empty)"}`,
        ].join("\n")
      }

      const transcriptState = {
        assistantId: "",
        assistantText: "",
        assistantPersisted: false,
        reasoningId: "",
        reasoningText: "",
        reasoningPersisted: false,
        assistantContentSeen: false,
        modelActivitySeen: false,
      }

      const resetTranscriptTurn = () => {
        transcriptState.assistantId = ""
        transcriptState.assistantText = ""
        transcriptState.assistantPersisted = false
        transcriptState.reasoningId = ""
        transcriptState.reasoningText = ""
        transcriptState.reasoningPersisted = false
        transcriptState.assistantContentSeen = false
        transcriptState.modelActivitySeen = false
      }

      const persistAssistantSegment = () => {
        if (!transcriptState.assistantId || !transcriptState.assistantText.trim() || transcriptState.assistantPersisted) return
        const completedEntry: ChatEntry = {
          id: transcriptState.assistantId,
          role: "assistant",
          text: transcriptState.assistantText,
          status: "complete",
        }
        patchEntryRef.current?.(transcriptState.assistantId, { status: "complete" })
        appendSessionEntry(sessionsDir, runtime.sessionId, completedEntry)
        transcriptState.assistantPersisted = true
      }

      const closeAssistantSegment = () => {
        if (transcriptState.assistantId && !transcriptState.assistantText.trim()) {
          removeEntryRef.current?.(transcriptState.assistantId)
          transcriptState.assistantId = ""
          transcriptState.assistantText = ""
          transcriptState.assistantPersisted = false
          return
        }

        persistAssistantSegment()
        transcriptState.assistantId = ""
        transcriptState.assistantText = ""
        transcriptState.assistantPersisted = false
      }

      const dropReasoningSegment = () => {
        if (transcriptState.reasoningId) removeEntryRef.current?.(transcriptState.reasoningId)
        transcriptState.reasoningId = ""
        transcriptState.reasoningText = ""
        transcriptState.reasoningPersisted = false
      }

      const closeReasoningSegment = () => {
        if (!transcriptState.reasoningId) return
        const summary = summarizeReasoning(transcriptState.reasoningText)
        patchEntryRef.current?.(transcriptState.reasoningId, { text: summary, detail: transcriptState.reasoningText, status: "complete" })
        if (!transcriptState.reasoningPersisted) {
          appendSessionEntry(sessionsDir, runtime.sessionId, {
            id: transcriptState.reasoningId,
            role: "reasoning",
            text: summary,
            status: "complete",
            detail: transcriptState.reasoningText,
            expanded: false,
          })
        }
        transcriptState.reasoningId = ""
        transcriptState.reasoningText = ""
        transcriptState.reasoningPersisted = false
      }

      const ensureAssistantSegment = () => {
        if (!transcriptState.assistantId) {
          transcriptState.assistantId = appendEntryRef.current?.({
            role: "assistant",
            text: "",
            status: "pending",
          }, { persist: false }) || createEntryId("assistant")
          transcriptState.assistantText = ""
          transcriptState.assistantPersisted = false
        }
      }

      const runtime = createRuntime({
        workspaceRoot,
        onEvent: (event: AgentEvent) => {
          if (event.type === "text" && event.text) {
            setAssistantCompleteRef.current?.(event.text)
            closeAssistantSegment()
          }

          if (event.type === "tool_call" && event.toolCall) {
            closeReasoningSegment()
            closeAssistantSegment()
            transcriptState.modelActivitySeen = true
            const entryId = `tool-${event.toolCall.id}`
            toolEntryIds.set(event.toolCall.id, entryId)
            toolCallArgs.set(event.toolCall.id, event.toolCall.args)
            appendEntryRef.current?.({
              id: entryId,
              role: "tool_use",
              toolName: event.toolCall.name,
              text: `▸ ${event.toolCall.name}`,
              status: "pending",
              detail: `Arguments:\n${formatJson(event.toolCall.args)}`,
              expanded: false,
            }, { persist: false })
          }

          if (event.type === "tool_result" && event.toolResult) {
            const entryId = toolEntryIds.get(event.toolResult.id) || `tool-${event.toolResult.id}`
            const patch = {
              text: event.toolResult.result.isError ? `✗ ${event.toolResult.name}` : `✓ ${event.toolResult.name}`,
              detail: formatToolResult(event.toolResult),
            }
            const completedEntry: ChatEntry = {
              id: entryId,
              role: "tool_use",
              toolName: event.toolResult.name,
              status: "complete",
              expanded: false,
              ...patch,
            }
            if (toolEntryIds.has(event.toolResult.id)) {
              patchEntryRef.current?.(entryId, { ...patch, status: "complete" })
            } else {
              appendEntryRef.current?.(completedEntry, { persist: false })
            }
            appendSessionEntry(sessionsDir, runtime.sessionId, completedEntry)
          }

          if (event.type === "done") {
            finishTurnRef.current?.("")
          }

          if (event.type === "error" && event.error) {
            closeReasoningSegment()
            closeAssistantSegment()
            appendEntryRef.current?.({
              id: createEntryId("error"),
              role: "error",
              text: event.error.message,
              status: "complete",
            })
          }

          if (event.type === "compaction" && event.summary) {
            appendEntryRef.current?.({
              id: createEntryId("system"),
              role: "system",
              text: "Context compacted",
              status: "complete",
              detail: event.summary,
              expanded: false,
            })
          }
        },
      })

      const sessionHistory = loadSessionHistory(sessionsDir, runtime.sessionId)

      const models = Object.entries(config.providers).flatMap(([pid, p]) =>
        p.models.map((m) => ({
          providerId: pid,
          modelId: m.id,
          contextWindow: m.contextWindow,
          capabilities: m.capabilities,
        }))
      )

      const App = () => {
        const [entries, setEntries] = React.useState<ChatEntry[]>(sessionHistory)
        const [status, setStatus] = React.useState<"idle" | "thinking" | "tool" | "sending">("idle")
        const [tokenUsed, setTokenUsed] = React.useState(runtime.tokenUsage.totalTokens)
        const [tokenTotal, setTokenTotal] = React.useState(runtime.tokenTotal)
        const [currentModel, setCurrentModel] = React.useState(`${runtime.config.defaults.provider}/${runtime.config.defaults.model}`)
        const [todoProgress, setTodoProgress] = React.useState(() => getActiveTodosSummary(runtime.todoState))
        const [subagentStatus, setSubagentStatus] = React.useState<{ agentId: string; task: string; status: "running" | "completed" | "error"; progress?: string } | undefined>()
        const [viewingAgentId, setViewingAgentId] = React.useState<string | undefined>(undefined)

        const addEntry = React.useCallback((entry: ChatEntry, options: { persist?: boolean } = {}) => {
          const nextEntry = { ...entry, id: entry.id || createEntryId(entry.role) }
          setEntries((prev) => [...prev, nextEntry])
          if (options.persist !== false) appendSessionEntry(sessionsDir, runtime.sessionId, nextEntry)
          return nextEntry.id
        }, [])

        const patchEntry = React.useCallback((id: string, patch: Partial<ChatEntry>) => {
          setEntries((prev) => prev.map((entry) => entry.id === id ? { ...entry, ...patch } : entry))
        }, [])

        const removeEntry = React.useCallback((id: string) => {
          setEntries((prev) => prev.filter((entry) => entry.id !== id))
        }, [])

        React.useEffect(() => {
          ;(appendEntryRef as any).current = addEntry
          ;(patchEntryRef as any).current = patchEntry
          ;(removeEntryRef as any).current = removeEntry
          ;(appendReasoningDeltaRef as any).current = (chunk: string) => {
            closeAssistantSegment()
            transcriptState.modelActivitySeen = true
            if (!transcriptState.reasoningId) {
              transcriptState.reasoningId = addEntry({
                role: "reasoning",
                text: "Thinking…",
                status: "pending",
                detail: chunk,
                expanded: false,
              }, { persist: false })
              transcriptState.reasoningText = chunk
              transcriptState.reasoningPersisted = false
            } else {
              transcriptState.reasoningText += chunk
              patchEntry(transcriptState.reasoningId, { detail: transcriptState.reasoningText })
            }
          }
          ;(appendAssistantDeltaRef as any).current = (chunk: string) => {
            if (isDuplicateReasoningContent(transcriptState.reasoningText, chunk)) dropReasoningSegment()
            else closeReasoningSegment()
            ensureAssistantSegment()
            transcriptState.modelActivitySeen = true
            transcriptState.assistantContentSeen = true
            transcriptState.assistantText = chunk.startsWith(transcriptState.assistantText)
              ? chunk
              : transcriptState.assistantText + chunk
            patchEntry(transcriptState.assistantId, { text: transcriptState.assistantText })
          }
          ;(setAssistantCompleteRef as any).current = (content: string) => {
            if (isDuplicateReasoningContent(transcriptState.reasoningText, content)) dropReasoningSegment()
            else closeReasoningSegment()
            ensureAssistantSegment()
            transcriptState.modelActivitySeen = true
            transcriptState.assistantContentSeen = true
            transcriptState.assistantText = content
            patchEntry(transcriptState.assistantId, { text: content })
          }
          ;(finishTurnRef as any).current = (result: string) => {
            if (result && !transcriptState.assistantContentSeen && isDuplicateReasoningContent(transcriptState.reasoningText, result)) {
              closeReasoningSegment()
              closeAssistantSegment()
              return
            }

            closeReasoningSegment()
            if (result && (!transcriptState.assistantContentSeen || transcriptState.assistantId)) {
              setAssistantCompleteRef.current?.(result)
            }
            closeAssistantSegment()
          }
        }, [addEntry, patchEntry, removeEntry])

        const handleMessage = async (text: string) => {
          if (text === "/clear") {
            await processUserInput(runtime, text)
            setEntries([])
            setTokenUsed(runtime.tokenUsage.totalTokens)
            setTokenTotal(runtime.tokenTotal)
            setCurrentModel(`${runtime.config.defaults.provider}/${runtime.config.defaults.model}`)
            return
          }

          resetTranscriptTurn()
          addEntry({ role: "user", text })
          setStatus("thinking")

          const updateStream = (delta: { content?: string; reasoning?: string }) => {
            if (delta.reasoning) appendReasoningDeltaRef.current?.(delta.reasoning)
            if (delta.content) appendAssistantDeltaRef.current?.(delta.content)
          }

          try {
            const result = await processUserInput(runtime, text, {
              onStreamDelta: updateStream,
            })
            finishTurnRef.current?.(result)
            setTokenUsed(runtime.tokenUsage.totalTokens)
            setTokenTotal(runtime.tokenTotal)
            setCurrentModel(`${runtime.config.defaults.provider}/${runtime.config.defaults.model}`)
            setTodoProgress(getActiveTodosSummary(runtime.todoState))

            if (!transcriptState.assistantContentSeen && !transcriptState.modelActivitySeen) {
              addEntry({
                role: "system",
                text: "No assistant content returned. The model may have produced reasoning/tool activity only.",
                status: "complete",
              })
            }
          } catch (e) {
            closeReasoningSegment()
            closeAssistantSegment()
            const message = `Error: ${(e as Error).message}`
            addEntry({ role: "error", text: message, status: "complete" })
          }

          setStatus("idle")
        }

        return React.createElement(AgentShell, {
          agentId: runtime.currentAgentId,
          sessionId: runtime.sessionId,
          model: currentModel,
          workspace: config.workspaceRoot,
          tokenUsed,
          tokenTotal,
          version: "0.2.0",
          todoProgress,
          subagentStatus,
          viewingAgentId,
          entries,
          onMessage: handleMessage,
        })
      }

      render(React.createElement(App), {
        exitOnCtrlC: false,
        stdout: process.stdout,
        stdin: process.stdin,
      })
    }
  })

program.parseAsync(process.argv).catch((error) => {
  console.error("Fatal:", error.message)
  process.exit(1)
})
