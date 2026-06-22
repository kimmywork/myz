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

      const updateEntryRef = React.createRef<(idx: number, text: string) => void>()

      const runtime = createRuntime({
        workspaceRoot,
        onEvent: (event: AgentEvent) => {
          if (!updateEntryRef.current) return
          // Only tool_call and tool_result are appended as separate entries
          // text/reasoning streaming is handled by processUserInput's onStreamDelta
          if (event.type === "tool_call" && event.toolCall) {
            // Don't create new entry — just log internally
          }
          if (event.type === "tool_result" && event.toolResult) {
            // Don't create new entry — the streaming entry already shows progress
          }
          if (event.type === "error" && event.error) {
            // Handled by catch in handleMessage
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

        const addEntry = React.useCallback((entry: ChatEntry) => {
          setEntries((prev) => [...prev, entry])
          appendSessionEntry(sessionsDir, runtime.sessionId, entry)
        }, [])

        const updateEntry = React.useCallback((idx: number, text: string) => {
          setEntries((prev) => {
            const next = [...prev]
            if (next[idx]) next[idx] = { ...next[idx], text }
            return next
          })
        }, [])

        React.useEffect(() => {
          (updateEntryRef as any).current = updateEntry
        }, [updateEntry])

        const handleMessage = async (text: string) => {
          if (text === "/clear") { setEntries([]); return }
          addEntry({ role: "user", text })
          setStatus("thinking")

          // Create a single streaming entry
          const streamIdx = entries.length + 1
          addEntry({ role: "assistant", text: "" })

          let streamText = ""
          let reasoningText = ""
          let lastToolName = ""

          const updateStream = (delta: { content?: string; reasoning?: string }) => {
            if (delta.content) {
              streamText += delta.content
            }
            if (delta.reasoning) {
              reasoningText += delta.reasoning
            }
            // Build display: reasoning as dim prefix, content as main text
            const display = reasoningText && !streamText
              ? reasoningText.slice(-200)
              : streamText
            updateEntry(streamIdx, display)
          }

          try {
            const result = await processUserInput(runtime, text, {
              onStreamDelta: updateStream,
            })
            // Final update — use complete result
            if (result) {
              updateEntry(streamIdx, result)
              appendSessionEntry(sessionsDir, runtime.sessionId, { role: "assistant", text: result })
            } else {
              // No content (e.g., only tool calls happened)
              setEntries((prev) => {
                const next = [...prev]
                if (next[streamIdx]) next.splice(streamIdx, 1)
                return next
              })
            }
          } catch (e) {
            updateEntry(streamIdx, `Error: ${(e as Error).message}`)
          }

          setStatus("idle")
        }

        return React.createElement(AgentShell, {
          agentId: runtime.currentAgentId,
          sessionId: runtime.sessionId,
          model: `${config.defaults.provider}/${config.defaults.model}`,
          workspace: config.workspaceRoot,
          tokenUsed: 0,
          tokenTotal: (() => {
            const p = config.providers[config.defaults.provider]
            const m = p?.models.find((m) => m.id === config.defaults.model)
            return m?.contextWindow || 0
          })(),
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
