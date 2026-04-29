import blessed from "blessed"
import { THEME } from "./shared"

export interface TerminalWidgets {
  header: blessed.Widgets.BoxElement
  sidebarSession: blessed.Widgets.BoxElement
  sidebarModel: blessed.Widgets.BoxElement
  sidebarRequest: blessed.Widgets.BoxElement
  chat: blessed.Widgets.BoxElement
  hint: blessed.Widgets.BoxElement
  input: blessed.Widgets.TextboxElement
}

export function createTerminalWidgets(screen: blessed.Widgets.Screen): TerminalWidgets {
  const root = blessed.box({
    parent: screen,
    width: "100%",
    height: "100%",
    style: {
      bg: THEME.background,
    },
  })

  const header = blessed.box({
    parent: root,
    top: 0,
    left: 0,
    width: "100%",
    height: 4,
    border: "line",
    tags: true,
    style: {
      border: { fg: THEME.borderActive },
      bg: THEME.panelAlt,
    },
  })

  const sidebarSession = blessed.box({
    parent: root,
    top: 4,
    left: 0,
    width: "28%",
    height: 8,
    border: "line",
    label: " Session ",
    tags: true,
    style: {
      border: { fg: THEME.border },
      bg: THEME.panel,
    },
  })

  const sidebarModel = blessed.box({
    parent: root,
    top: 12,
    left: 0,
    width: "28%",
    height: 8,
    border: "line",
    label: " Model ",
    tags: true,
    style: {
      border: { fg: THEME.border },
      bg: THEME.panel,
    },
  })

  const sidebarRequest = blessed.box({
    parent: root,
    top: 20,
    left: 0,
    width: "28%",
    bottom: 4,
    border: "line",
    label: " Throughput ",
    tags: true,
    style: {
      border: { fg: THEME.border },
      bg: THEME.panel,
    },
  })

  const chat = blessed.box({
    parent: root,
    top: 4,
    left: "28%",
    width: "72%",
    bottom: 4,
    border: "line",
    label: " Conversation ",
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    mouse: true,
    scrollbar: {
      ch: " ",
    },
    style: {
      border: { fg: THEME.accent },
      bg: THEME.panelAlt,
      scrollbar: { bg: THEME.accent },
    },
  })

  const hint = blessed.box({
    parent: root,
    left: 0,
    bottom: 3,
    width: "100%",
    height: 1,
    tags: true,
    style: {
      fg: THEME.muted,
      bg: THEME.background,
    },
  })

  const input = blessed.textbox({
    parent: root,
    left: 0,
    bottom: 0,
    width: "100%",
    height: 3,
    border: "line",
    label: " Local TUI ",
    inputOnFocus: true,
    keys: true,
    mouse: true,
    tags: false,
    style: {
      fg: THEME.text,
      bg: THEME.panelAlt,
      border: { fg: THEME.accentAlt },
      focus: {
        border: { fg: THEME.borderActive },
      },
    },
  })

  return {
    header,
    sidebarSession,
    sidebarModel,
    sidebarRequest,
    chat,
    hint,
    input,
  }
}
