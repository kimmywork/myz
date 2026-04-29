import type blessed from "blessed"
import type { RuntimeMonitorSnapshot } from "../runtimeMonitor"
import { COMPACT_LAYOUT_HEIGHT, COMPACT_LAYOUT_WIDTH } from "./shared"
import type { TerminalWidgets } from "./widgets"

type SizedOutput = NodeJS.WriteStream & { columns?: number; rows?: number }

export interface TerminalViewport {
  width: number
  height: number
}

export function getTerminalViewport(
  screen: blessed.Widgets.Screen,
  output?: NodeJS.WriteStream,
): TerminalViewport {
  const sizedOutput = output as SizedOutput | undefined
  const cols = (screen as unknown as { cols?: number }).cols
  const rows = (screen as unknown as { rows?: number }).rows

  return {
    width:
      typeof cols === "number" && Number.isFinite(cols)
        ? cols
        : sizedOutput?.columns || process.stdout.columns || 120,
    height:
      typeof rows === "number" && Number.isFinite(rows)
        ? rows
        : sizedOutput?.rows || process.stdout.rows || 32,
  }
}

export function isCompactLayout(viewport: TerminalViewport) {
  return viewport.width < COMPACT_LAYOUT_WIDTH || viewport.height < COMPACT_LAYOUT_HEIGHT
}

export function computeChatWidth(screenWidth: number, compact: boolean) {
  return compact
    ? Math.max(44, screenWidth - 10)
    : Math.max(44, screenWidth - Math.floor(screenWidth * 0.28) - 12)
}

export function applyLayout(
  widgets: TerminalWidgets,
  snapshot?: RuntimeMonitorSnapshot | null,
  compact = false,
) {
  const inputVisible = snapshot?.inputEnabled !== false
  const { header, sidebarSession, sidebarModel, sidebarRequest, chat, hint, input } = widgets

  if (compact) {
    header.height = 5
    sidebarSession.hide()
    sidebarModel.hide()
    sidebarRequest.hide()
    chat.top = 5
    chat.left = 0
    chat.width = "100%"
    chat.bottom = inputVisible ? 4 : 1
    hint.bottom = 3
    input.bottom = 0
    return
  }

  header.height = 4
  sidebarSession.show()
  sidebarModel.show()
  sidebarRequest.show()
  sidebarSession.top = 4
  sidebarSession.left = 0
  sidebarSession.width = "28%"
  sidebarSession.height = 8
  sidebarModel.top = 12
  sidebarModel.left = 0
  sidebarModel.width = "28%"
  sidebarModel.height = 8
  sidebarRequest.top = 20
  sidebarRequest.left = 0
  sidebarRequest.width = "28%"
  sidebarRequest.bottom = inputVisible ? 4 : 1
  chat.top = 4
  chat.left = "28%"
  chat.width = "72%"
  chat.bottom = inputVisible ? 4 : 1
  hint.bottom = 3
  input.bottom = 0
}
