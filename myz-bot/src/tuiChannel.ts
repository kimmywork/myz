import { emitKeypressEvents } from "node:readline"
import { stdin as defaultInput } from "node:process"
import type {
  ChatChannelClient,
  ChatFile,
  ChatMediaClient,
  ChatMessage,
  ChatUpdate,
  ChatUser,
  PollingChatInputClient,
} from "./chatChannel"
import type { BotRuntimeConfig } from "./config"
import type { RuntimeMonitor } from "./runtimeMonitor"

export const LOCAL_TUI_CHAT_ID = 910000001
export const LOCAL_TUI_USER_ID = 910000002
const LOCAL_TUI_BOT_USER_ID = 910000003

type KeypressInput = NodeJS.ReadStream & {
  setRawMode?: (mode: boolean) => void
}

function normalizeUsername(value: string) {
  return value.trim().replace(/^@/, "")
}

function buildLocalChat() {
  return {
    id: LOCAL_TUI_CHAT_ID,
    type: "private",
    title: "Local TUI",
  } as const
}

function buildTimestamp(now: () => Date) {
  return Math.floor(now().getTime() / 1000)
}

export function isLocalTuiChatId(chatId: number) {
  return chatId === LOCAL_TUI_CHAT_ID
}

export function createLocalTuiUser(config: BotRuntimeConfig): ChatUser {
  const username = normalizeUsername(config.channels.tui.operatorUsername || "local")
  return {
    id: LOCAL_TUI_USER_ID,
    username,
    firstName: config.channels.tui.operatorFirstName,
    lastName: config.channels.tui.operatorLastName,
  }
}

function createLocalBotUser(config: BotRuntimeConfig): ChatUser {
  return {
    id: LOCAL_TUI_BOT_USER_ID,
    username: "myzbot",
    firstName: "MyZ",
    lastName: "Bot",
  }
}

export function createLocalTuiMessage(options: {
  config: BotRuntimeConfig
  text: string
  messageId: number
  now?: () => Date
}): ChatMessage {
  const now = options.now || (() => new Date())
  return {
    messageId: options.messageId,
    unixTime: buildTimestamp(now),
    text: options.text,
    from: createLocalTuiUser(options.config),
    chat: buildLocalChat(),
  }
}

export function createTuiAwareChannelClient(options: {
  base?:
    | (ChatChannelClient<ChatMessage> &
        Partial<PollingChatInputClient<ChatUpdate, ChatUser>> &
        Partial<ChatMediaClient<ChatFile>>)
    | null
  config: BotRuntimeConfig
  now?: () => Date
}): ChatChannelClient<ChatMessage> &
  Partial<PollingChatInputClient<ChatUpdate, ChatUser>> &
  Partial<ChatMediaClient<ChatFile>> {
  const now = options.now || (() => new Date())
  let localMessageId = 1

  return {
    ...(options.base?.getUpdates
      ? {
          getUpdates: (offset: number) => options.base?.getUpdates?.(offset) || Promise.resolve([]),
        }
      : {}),
    ...(options.base?.getMe
      ? {
          getMe: () => options.base?.getMe?.() || Promise.resolve(createLocalTuiUser(options.config)),
        }
      : {}),
    ...(options.base?.getFile
      ? {
          getFile: (fileId: string) => {
            if (!options.base?.getFile) {
              throw new Error("channel does not support getFile")
            }
            return options.base.getFile(fileId)
          },
        }
      : {}),
    ...(options.base?.downloadFile
      ? {
          downloadFile: (filePath: string) => {
            if (!options.base?.downloadFile) {
              throw new Error("channel does not support downloadFile")
            }
            return options.base.downloadFile(filePath)
          },
        }
      : {}),
    sendChatAction: (chatId, action, sendOptions) => {
      if (isLocalTuiChatId(chatId)) return Promise.resolve(true)
      if (!options.base) {
        throw new Error("no channel available for sendChatAction")
      }
      return options.base.sendChatAction(chatId, action, sendOptions)
    },
    setMessageReaction: (chatId, messageId, reaction, reactionOptions) => {
      if (isLocalTuiChatId(chatId)) return Promise.resolve(true)
      if (!options.base) {
        throw new Error("no channel available for setMessageReaction")
      }
      return options.base.setMessageReaction(chatId, messageId, reaction, reactionOptions)
    },
    sendMessage: async (chatId, text, sendOptions) => {
      if (!isLocalTuiChatId(chatId)) {
        if (!options.base) {
          throw new Error("no channel available for sendMessage")
        }
        return options.base.sendMessage(chatId, text, sendOptions)
      }
      const message: ChatMessage = {
        messageId: localMessageId,
        unixTime: buildTimestamp(now),
        text,
        from: createLocalBotUser(options.config),
        chat: buildLocalChat(),
        ...(typeof sendOptions?.replyToMessageId === "number"
          ? {
              replyToMessage: {
                messageId: sendOptions.replyToMessageId,
                unixTime: buildTimestamp(now),
                text: "",
                from: createLocalTuiUser(options.config),
                chat: buildLocalChat(),
              },
            }
          : {}),
      }
      localMessageId += 1
      return [message]
    },
  }
}

export function startLocalTuiChannel(options: {
  config: BotRuntimeConfig
  monitor?: RuntimeMonitor
  onMessage: (message: ChatMessage) => Promise<void>
  enabled?: boolean
  input?: KeypressInput
  now?: () => Date
}) {
  const input = options.input || (defaultInput as KeypressInput)
  const now = options.now || (() => new Date())
  const enabled = Boolean(options.enabled !== false && input.isTTY)
  let draft = ""
  let closed = false
  let pending = 0
  let messageId = 1
  let queue = Promise.resolve()
  let monitorBinding: { enabled: boolean; close: () => void } | null = null

  const renderInputState = (hint?: string, includeDraft = false) => {
    options.monitor?.setInputState({
      enabled,
      label: options.config.channels.tui.label,
      ...(includeDraft ? { draft } : {}),
      hint:
        hint ||
        (pending > 0
          ? `${options.config.channels.tui.label} chat | pending=${pending} | Enter queues | Ctrl+C exit`
          : `${options.config.channels.tui.label} chat | Enter send | Ctrl+U clear | Ctrl+C exit`),
    })
  }

  if (!enabled) {
    renderInputState("")
    return {
      enabled: false,
      close() {
        options.monitor?.setInputState({
          enabled: false,
          draft: "",
          hint: "",
        })
      },
      async flush() {
        await queue
      },
    }
  }

  const enqueueText = (value: string) => {
    const text = value.trim()
    if (!text) return
    pending += 1
    renderInputState()
    queue = queue
      .then(async () => {
        await options.onMessage(
          createLocalTuiMessage({
            config: options.config,
            text,
            messageId,
            now,
          }),
        )
        messageId += 1
      })
      .catch((error) => {
        options.monitor?.noteError({
          sessionId: `${LOCAL_TUI_CHAT_ID}-${LOCAL_TUI_USER_ID}`,
          error,
        })
      })
      .finally(() => {
        pending = Math.max(0, pending - 1)
        renderInputState()
      })
  }

  const submitDraft = () => {
    const text = draft.trim()
    draft = ""
    renderInputState(undefined, true)
    enqueueText(text)
  }

  const close = () => {
    if (closed) return
    closed = true
    monitorBinding?.close()
    input.off("keypress", onKeypress)
    input.setRawMode?.(false)
    options.monitor?.setInputState({
      enabled: false,
      draft: "",
      hint: "",
    })
  }

  const onKeypress = (value: string, key: { ctrl?: boolean; meta?: boolean; name?: string }) => {
    if (closed) return
    if (key.ctrl && key.name === "c") {
      close()
      process.kill(process.pid, "SIGINT")
      return
    }
    if (key.ctrl && key.name === "u") {
      draft = ""
      renderInputState(undefined, true)
      return
    }
    if (key.name === "return") {
      submitDraft()
      return
    }
    if (key.name === "backspace") {
      draft = draft.slice(0, -1)
      renderInputState(undefined, true)
      return
    }
    if (key.name === "escape") {
      draft = ""
      renderInputState(undefined, true)
      return
    }
    if (!key.ctrl && !key.meta && value) {
      draft += value
      renderInputState(undefined, true)
    }
  }

  monitorBinding = options.monitor?.bindInput?.({
    enabled,
    label: options.config.channels.tui.label,
    onSubmit(text) {
      enqueueText(text)
    },
    onExit() {
      close()
      process.kill(process.pid, "SIGINT")
    },
  }) || null

  if (monitorBinding?.enabled) {
    renderInputState()
    return {
      enabled: true,
      close,
      async flush() {
        await queue
      },
    }
  }

  emitKeypressEvents(input)
  input.setRawMode?.(true)
  input.on("keypress", onKeypress)
  renderInputState(undefined, true)

  return {
    enabled: true,
    close,
    async flush() {
      await queue
    },
  }
}