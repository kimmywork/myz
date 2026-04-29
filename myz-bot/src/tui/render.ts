import type { RuntimeMonitorSnapshot } from "../runtimeMonitor"
import {
  CHAT_ENTRY_SEPARATOR,
  badge,
  buildMeter,
  colorizePhase,
  escapeContent,
  formatDurationMs,
  formatTokensPerSecond,
  phaseBadgeTone,
  renderChatEntry,
  toneForPhase,
} from "./formatting"
import { computeChatWidth } from "./layout"
import { THEME } from "./shared"
import type { TerminalWidgets } from "./widgets"

export function resolveChatScrollPerc(options: {
  previousScrollPerc: number
  stickToBottom: boolean
}) {
  if (options.stickToBottom || !Number.isFinite(options.previousScrollPerc)) {
    return 100
  }
  return Math.max(0, Math.min(100, options.previousScrollPerc))
}

export function renderSnapshot(options: {
  snapshot: RuntimeMonitorSnapshot
  widgets: TerminalWidgets
  compact: boolean
  screenWidth: number
  inputFocused: boolean
  previousChatScrollPerc: number
  stickChatToBottom: boolean
}) {
  const {
    snapshot,
    widgets,
    compact,
    screenWidth,
    inputFocused,
    previousChatScrollPerc,
    stickChatToBottom,
  } = options
  const { header, sidebarSession, sidebarModel, sidebarRequest, chat, hint, input } = widgets
  const phaseTone = toneForPhase(snapshot.phase)
  const conversationBadge = badge(
    snapshot.activeConversationId || "NO CONVERSATION",
    "black",
    phaseBadgeTone(snapshot.phase),
  )
  const streamBadge = badge(
    snapshot.streamingEnabled ? "STREAM ON" : "STREAM OFF",
    "black",
    snapshot.streamingEnabled ? "green" : "gray",
  )
  const historyBadge = badge(snapshot.historyMode, "black", "blue")
  const compactionBadge = badge(snapshot.contextCompactionStatus, "black", "yellow")

  header.setContent(
    compact
      ? [
          `{bold}{white-fg}MyZ Bot Runtime{/white-fg}{/bold}  ${colorizePhase(snapshot.phase)}  ${streamBadge}`,
          `${conversationBadge}`,
          `{gray-fg}${escapeContent(snapshot.provider)}{/gray-fg}  ${escapeContent(snapshot.model)}  {gray-fg}req{/gray-fg} ${snapshot.requestCount}  {gray-fg}pending{/gray-fg} ${snapshot.pendingRequests}`,
          `{gray-fg}ctx{/gray-fg} ${snapshot.contextMessages} msg / ~${snapshot.contextTokensEstimate} tok  {gray-fg}history{/gray-fg} ${escapeContent(snapshot.historyMode)}  ${compactionBadge}`,
        ].join("\n")
      : [
          `{bold}{white-fg}MyZ Bot Runtime{/white-fg}{/bold}  ${colorizePhase(snapshot.phase)}  ${streamBadge}`,
          `${conversationBadge}  ${historyBadge}  ${compactionBadge}`,
          `{gray-fg}provider{/gray-fg} ${escapeContent(snapshot.provider)}  {gray-fg}model{/gray-fg} ${escapeContent(snapshot.model)}  {gray-fg}updated{/gray-fg} ${escapeContent(snapshot.lastUpdatedAt || "-")}`,
        ].join("\n"),
  )

  sidebarSession.setContent(
    [
      `{bold}Conversation{/bold}`,
      `${escapeContent(snapshot.activeConversationId || "-")}`,
      "",
      `{bold}Runtime{/bold} ${formatDurationMs(snapshot.totalDurationMs)}`,
      `{bold}Requests{/bold} ${snapshot.requestCount}  {bold}Pending{/bold} ${snapshot.pendingRequests}`,
      `{bold}Tokens{/bold} ${snapshot.totalTokens}`,
      `{bold}Context{/bold} ${snapshot.contextMessages} msg / ~${snapshot.contextTokensEstimate} tok`,
    ].join("\n"),
  )

  sidebarModel.setContent(
    [
      `{bold}Provider{/bold}`,
      `${escapeContent(snapshot.provider)}`,
      "",
      `{bold}Model{/bold}`,
      `${escapeContent(snapshot.model)}`,
      "",
      `{bold}History{/bold} ${escapeContent(snapshot.historyMode)}`,
      `{bold}Compaction{/bold} ${escapeContent(snapshot.contextCompactionStatus)}`,
    ].join("\n"),
  )

  const lastRequest = snapshot.lastRequest
  sidebarRequest.setContent(
    lastRequest
      ? [
          `{bold}Source{/bold} ${escapeContent(lastRequest.source)}`,
          `{bold}Duration{/bold} ${formatDurationMs(lastRequest.durationMs)}`,
          `{bold}TPS{/bold} ${formatTokensPerSecond(lastRequest.tokensPerSecond)}`,
          "",
          `{bold}Prompt{/bold} ${lastRequest.promptTokens}`,
          `{blue-fg}${buildMeter(lastRequest.promptTokens, Math.max(1, lastRequest.totalTokens || 1))}{/blue-fg}`,
          `{bold}Completion{/bold} ${lastRequest.completionTokens}`,
          `{green-fg}${buildMeter(lastRequest.completionTokens, Math.max(1, lastRequest.totalTokens || 1))}{/green-fg}`,
          `{bold}Reasoning{/bold} ${lastRequest.reasoningTokens}  {bold}Cached{/bold} ${lastRequest.cachedPromptTokens}`,
          `{bold}Tools{/bold} ${lastRequest.toolCallCount}`,
          `{bold}Finished{/bold} ${escapeContent(lastRequest.finishedAt || "-")}`,
        ].join("\n")
      : `{gray-fg}Waiting for the first completed request...{/gray-fg}`,
  )

  const chatWidth = computeChatWidth(screenWidth, compact)
  const chatLines = snapshot.chatTail.map((entry) => renderChatEntry({ entry, chatWidth }).content)
  chat.setContent(
    chatLines.join(`\n\n${CHAT_ENTRY_SEPARATOR}\n\n`) ||
      `{gray-fg}Waiting for conversation activity...{/gray-fg}`,
  )
  chat.setScrollPerc(
    resolveChatScrollPerc({
      previousScrollPerc: previousChatScrollPerc,
      stickToBottom: stickChatToBottom,
    }),
  )

  hint.setContent(
    [
      badge("CTRL+C", "black", "red"),
      badge("CTRL+U", "black", "yellow"),
      badge("ESC", "black", "blue"),
      badge("UP/DOWN", "black", "cyan"),
      `{gray-fg}${escapeContent(snapshot.inputHint || "Type a message and press Enter")}{/gray-fg}`,
    ].join("  "),
  )
  input.setLabel(` ${escapeContent(snapshot.inputLabel || "Local TUI")} `)

  let shouldFocusInput = false
  if (snapshot.inputEnabled) {
    input.show()
    hint.show()
    if (input.getValue() !== snapshot.inputDraft) {
      input.setValue(snapshot.inputDraft || "")
    }
    shouldFocusInput = !inputFocused
  } else {
    input.hide()
    hint.hide()
  }

  if (snapshot.lastError) {
    header.style.border.fg = THEME.error
    chat.style.border.fg = THEME.error
  } else {
    header.style.border.fg = THEME.borderActive
    chat.style.border.fg = phaseTone
  }

  return {
    shouldFocusInput,
  }
}
