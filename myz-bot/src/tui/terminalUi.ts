import blessed from "blessed"
import type { RuntimeMonitorSnapshot } from "../runtimeMonitor"
import { createInputHistoryController } from "./history"
import { applyLayout, getTerminalViewport, isCompactLayout } from "./layout"
import { renderSnapshot } from "./render"
import { MAX_INPUT_HISTORY } from "./shared"
import { createTerminalWidgets } from "./widgets"

export interface TerminalUiInputBinding {
  enabled: boolean
  close: () => void
}

interface InputBindingState {
  onSubmit: (text: string) => void
  onExit?: () => void
  onChange?: (draft: string) => void
}

export function createTerminalUi(options: {
  input?: NodeJS.ReadStream
  output?: NodeJS.WriteStream
}) {
  const program = blessed.program({
    input: options.input,
    output: options.output,
    terminal: process.env.TERM,
    resizeTimeout: 300,
    tput: true,
    buffer: true,
    zero: true,
    extended: false,
  })

  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    dockBorders: true,
    autoPadding: false,
    warnings: false,
    title: "MyZ Bot Runtime",
    input: options.input,
    output: options.output,
    program,
  })
  const widgets = createTerminalWidgets(screen)
  const history = createInputHistoryController(MAX_INPUT_HISTORY)
  const { chat, input, hint } = widgets

  let lastSnapshot: RuntimeMonitorSnapshot | null = null
  let binding: InputBindingState | null = null
  let closed = false
  let stickChatToBottom = true

  const getChatScrollPerc = () => {
    const scrollPerc = chat.getScrollPerc()
    return Number.isFinite(scrollPerc) ? scrollPerc : 100
  }

  const refreshLayout = (snapshot?: RuntimeMonitorSnapshot | null) => {
    const viewport = getTerminalViewport(screen, options.output)
    const compact = isCompactLayout(viewport)
    applyLayout(widgets, snapshot, compact)
    return { viewport, compact }
  }

  const triggerExit = () => {
    binding?.onExit?.()
  }

  const setDraftValue = (value: string) => {
    input.setValue(value)
    binding?.onChange?.(value)
    screen.render()
  }

  const moveHistory = (direction: -1 | 1) => {
    if (!binding) return
    const nextValue = history.move(direction, input.getValue())
    if (nextValue === null) return
    setDraftValue(nextValue)
  }

  const syncDraft = () => {
    if (!binding || history.isBrowsing()) return
    binding.onChange?.(input.getValue())
  }

  input.on("keypress", () => {
    setTimeout(syncDraft, 0).unref?.()
  })

  chat.on("scroll", () => {
    stickChatToBottom = getChatScrollPerc() >= 99
  })

  input.on("submit", (value: string) => {
    if (!binding) return
    history.remember(value)
    binding.onSubmit(value)
    input.clearValue()
    binding.onChange?.("")
    history.reset()
    screen.render()
    input.focus()
    input.readInput()
  })

  input.key(["up", "C-p"], () => {
    moveHistory(-1)
  })

  input.key(["down", "C-n"], () => {
    moveHistory(1)
  })

  input.key(["C-u"], () => {
    input.clearValue()
    history.reset()
    syncDraft()
    screen.render()
  })

  input.key(["escape"], () => {
    input.clearValue()
    history.reset()
    syncDraft()
    screen.render()
  })

  input.key(["C-c"], () => {
    triggerExit()
  })

  screen.key(["C-c"], () => {
    triggerExit()
  })

  screen.key(["C-l"], () => {
    screen.render()
  })

  screen.on("resize", () => {
    if (lastSnapshot) {
      render(lastSnapshot)
    }
  })

  function render(snapshot: RuntimeMonitorSnapshot) {
    lastSnapshot = snapshot
    const { viewport, compact } = refreshLayout(snapshot)
    const previousChatScrollPerc = getChatScrollPerc()
    const { shouldFocusInput } = renderSnapshot({
      snapshot,
      widgets,
      compact,
      screenWidth: viewport.width,
      inputFocused: screen.focused === input,
      previousChatScrollPerc,
      stickChatToBottom,
    })

    if (shouldFocusInput) {
      input.focus()
    }

    screen.render()
  }

  function bindInput(options: {
    onSubmit: (text: string) => void
    onExit?: () => void
    onChange?: (draft: string) => void
  }): TerminalUiInputBinding {
    binding = {
      onSubmit: options.onSubmit,
      onExit: options.onExit,
      onChange: options.onChange,
    }
    history.reset()
    input.show()
    hint.show()
    input.focus()
    input.readInput()
    refreshLayout(lastSnapshot)
    screen.render()
    return {
      enabled: true,
      close() {
        binding = null
        history.reset()
        input.clearValue()
        input.hide()
        hint.hide()
        refreshLayout(lastSnapshot)
        screen.render()
      },
    }
  }

  function destroy() {
    if (closed) return
    closed = true
    binding = null
    screen.destroy()
  }

  return {
    render,
    bindInput,
    destroy,
  }
}
