import { Command } from "commander"
import { loadConfigNew } from "./config"
import { createRuntime, processUserInput } from "./index"
import type { AgentEvent } from "@myz/agent-core"
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

      const appendEntryRef = React.createRef<(entry: ChatEntry, options?: { persist?: boolean }) => void>()
      const patchEntryRef = React.createRef<(id: string, patch: Partial<ChatEntry>) => void>()
      const setAssistantTextRef = React.createRef<(text: string) => void>()
      const toolEntryIds = new Map<string, string>()
      const toolCallArgs = new Map<string, Record<string, unknown>>()

      const createEntryId = (role: string) => `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const formatJson = (value: unknown) => JSON.stringify(value, null, 2)
      const formatToolResult = (event: NonNullable<AgentEvent["toolResult"]>) => {
        const resultText = event.result.content.map((item) => item.text).join("\n")
        const args = toolCallArgs.get(event.id)
        return [
          args ? `Arguments:\n${formatJson(args)}` : "Arguments: {}",
          "",
          `Result:\n${resultText || "(empty)"}`,
        ].join("\n")
      }

      const runtime = createRuntime({
        workspaceRoot,
        onEvent: (event: AgentEvent) => {
          if (event.type === "text" && event.text) {
            setAssistantTextRef.current?.(event.text)
          }

          if (event.type === "tool_call" && event.toolCall) {
            const entryId = `tool-${event.toolCall.id}`
            toolEntryIds.set(event.toolCall.id, entryId)
            toolCallArgs.set(event.toolCall.id, event.toolCall.args)
            appendEntryRef.current?.({
              id: entryId,
              role: "tool_use",
              toolName: event.toolCall.name,
              text: `▸ ${event.toolCall.name}`,
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
              expanded: false,
              ...patch,
            }
            if (toolEntryIds.has(event.toolResult.id)) {
              patchEntryRef.current?.(entryId, patch)
            } else {
              appendEntryRef.current?.(completedEntry, { persist: false })
            }
            appendSessionEntry(sessionsDir, runtime.sessionId, completedEntry)
          }

          if (event.type === "error" && event.error) {
            appendEntryRef.current?.({
              id: createEntryId("error"),
              role: "error",
              text: event.error.message,
            })
          }

          if (event.type === "compaction" && event.summary) {
            appendEntryRef.current?.({
              id: createEntryId("system"),
              role: "system",
              text: "Context compacted",
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
        const [tokenUsed, setTokenUsed] = React.useState(runtime.tokenUsed)
        const [tokenTotal, setTokenTotal] = React.useState(runtime.tokenTotal)
        const [currentModel, setCurrentModel] = React.useState(`${runtime.config.defaults.provider}/${runtime.config.defaults.model}`)

        const addEntry = React.useCallback((entry: ChatEntry, options: { persist?: boolean } = {}) => {
          const nextEntry = { ...entry, id: entry.id || createEntryId(entry.role) }
          setEntries((prev) => [...prev, nextEntry])
          if (options.persist !== false) appendSessionEntry(sessionsDir, runtime.sessionId, nextEntry)
          return nextEntry.id
        }, [])

        const patchEntry = React.useCallback((id: string, patch: Partial<ChatEntry>) => {
          setEntries((prev) => prev.map((entry) => entry.id === id ? { ...entry, ...patch } : entry))
        }, [])

        React.useEffect(() => {
          ;(appendEntryRef as any).current = addEntry
          ;(patchEntryRef as any).current = patchEntry
        }, [addEntry, patchEntry])

        const handleMessage = async (text: string) => {
          if (text === "/clear") {
            await processUserInput(runtime, text)
            setEntries([])
            setTokenUsed(runtime.tokenUsed)
            setTokenTotal(runtime.tokenTotal)
            setCurrentModel(`${runtime.config.defaults.provider}/${runtime.config.defaults.model}`)
            return
          }

          addEntry({ role: "user", text })
          setStatus("thinking")

          const assistantEntryId = createEntryId("assistant")
          let assistantPersisted = false
          let reasoningEntryId = ""
          let streamText = ""
          let reasoningText = ""

          addEntry({ id: assistantEntryId, role: "assistant", text: "" }, { persist: false })
          ;(setAssistantTextRef as any).current = (content: string) => {
            streamText = content
            patchEntry(assistantEntryId, { text: content })
          }

          const updateStream = (delta: { content?: string; reasoning?: string }) => {
            if (delta.reasoning) {
              reasoningText += delta.reasoning
              if (!reasoningEntryId) {
                reasoningEntryId = addEntry({
                  role: "reasoning",
                  text: "Thinking…",
                  detail: reasoningText,
                  expanded: false,
                }, { persist: false })
              } else {
                patchEntry(reasoningEntryId, { detail: reasoningText })
              }
            }

            if (delta.content) {
              streamText += delta.content
              patchEntry(assistantEntryId, { text: streamText })
            }
          }

          try {
            const result = await processUserInput(runtime, text, {
              onStreamDelta: updateStream,
            })
            setTokenUsed(runtime.tokenUsed)
            setTokenTotal(runtime.tokenTotal)
            setCurrentModel(`${runtime.config.defaults.provider}/${runtime.config.defaults.model}`)

            if (reasoningText && reasoningEntryId) {
              patchEntry(reasoningEntryId, { text: "Thinking complete", detail: reasoningText })
              appendSessionEntry(sessionsDir, runtime.sessionId, {
                id: reasoningEntryId,
                role: "reasoning",
                text: "Thinking complete",
                detail: reasoningText,
                expanded: false,
              })
            }

            if (result) {
              patchEntry(assistantEntryId, { text: result })
              if (!assistantPersisted) {
                appendSessionEntry(sessionsDir, runtime.sessionId, { id: assistantEntryId, role: "assistant", text: result })
                assistantPersisted = true
              }
            } else {
              patchEntry(assistantEntryId, {
                role: "system",
                text: "No assistant content returned. The model may have produced reasoning/tool activity only.",
              })
              appendSessionEntry(sessionsDir, runtime.sessionId, {
                id: assistantEntryId,
                role: "system",
                text: "No assistant content returned. The model may have produced reasoning/tool activity only.",
              })
            }
          } catch (e) {
            const message = `Error: ${(e as Error).message}`
            patchEntry(assistantEntryId, { role: "error", text: message })
            appendSessionEntry(sessionsDir, runtime.sessionId, { id: assistantEntryId, role: "error", text: message })
          }

          ;(setAssistantTextRef as any).current = undefined
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
