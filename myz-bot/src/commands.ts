function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function normalizeCommandText(raw: string, botUsername: string) {
  if (!raw) return ""
  const pattern = new RegExp(
    `^(\\/\\w+)@${escapeRegExp(botUsername)}(?=\\s|\\/|$)`,
    "i",
  )
  return raw.trim().replace(pattern, "$1")
}

export type BotCommand = {
  name: string
  args: string[]
}

export function parseBotCommand(raw: string, botUsername: string): BotCommand | null {
  const text = normalizeCommandText(raw, botUsername)
  if (!text.startsWith("/")) return null
  if (text.startsWith("/skills/")) {
    return {
      name: "skills",
      args: [text.slice("/skills/".length)],
    }
  }
  const [commandToken, ...args] = text.split(/\s+/)
  return {
    name: commandToken.slice(1).toLowerCase(),
    args,
  }
}

export const SUPPORTED_BOT_COMMAND_NAMES = [
  "skills",
  "todo",
  "soul",
  "permit",
  "ops",
  "session",
  "clear",
  "resume",
  "fork",
] as const
export const PASSTHROUGH_BOT_COMMAND_NAMES = ["start"] as const

export function isSupportedBotCommandName(name: string) {
  return SUPPORTED_BOT_COMMAND_NAMES.includes(
    name as (typeof SUPPORTED_BOT_COMMAND_NAMES)[number],
  )
}

export function isPassthroughBotCommandName(name: string) {
  return PASSTHROUGH_BOT_COMMAND_NAMES.includes(
    name as (typeof PASSTHROUGH_BOT_COMMAND_NAMES)[number],
  )
}

export function formatSupportedBotCommands() {
  return SUPPORTED_BOT_COMMAND_NAMES.map((name) => `/${name}`).join("、")
}
