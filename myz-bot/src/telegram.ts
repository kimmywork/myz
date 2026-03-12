export interface TelegramUser {
  id: number
  username?: string
  first_name?: string
  last_name?: string
}

export interface TelegramChat {
  id: number
  type: string
}

export interface TelegramMessage {
  message_id: number
  date: number
  text?: string
  from?: TelegramUser
  chat: TelegramChat
}

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
}

export interface TelegramClientOptions {
  token: string
  timeoutSeconds?: number
  maxMessageLength?: number
}

function buildUrl(token: string, method: string) {
  return `https://api.telegram.org/bot${token}/${method}`
}

export function createTelegramClient(options: TelegramClientOptions) {
  const timeoutSeconds = options.timeoutSeconds ?? 25
  const maxMessageLength = options.maxMessageLength ?? 4000

  function splitMessage(text: string) {
    if (text.length <= maxMessageLength) return [text]
    const parts: string[] = []
    let remaining = text
    while (remaining.length > maxMessageLength) {
      let cut = remaining.lastIndexOf("\n", maxMessageLength)
      if (cut < maxMessageLength * 0.5) {
        cut = maxMessageLength
      }
      parts.push(remaining.slice(0, cut))
      remaining = remaining.slice(cut)
    }
    if (remaining.length) parts.push(remaining)
    return parts
  }

  async function getUpdates(offset: number) {
    const url = buildUrl(options.token, "getUpdates")
    const resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ offset, timeout: timeoutSeconds }),
    })
    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`Telegram getUpdates failed: ${resp.status} ${text}`)
    }
    const data = (await resp.json()) as { ok: boolean; result?: TelegramUpdate[] }
    if (!data.ok) throw new Error("Telegram getUpdates not ok")
    return data.result || []
  }

  async function sendMessage(chatId: number, text: string) {
    const url = buildUrl(options.token, "sendMessage")
    const chunks = splitMessage(text)
    const results = []
    for (const chunk of chunks) {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: chunk }),
      })
      if (!resp.ok) {
        const body = await resp.text()
        throw new Error(`Telegram sendMessage failed: ${resp.status} ${body}`)
      }
      results.push(await resp.json())
    }
    return results[results.length - 1]
  }

  async function getMe() {
    const url = buildUrl(options.token, "getMe")
    const resp = await fetch(url, { method: "GET" })
    if (!resp.ok) {
      const body = await resp.text()
      throw new Error(`Telegram getMe failed: ${resp.status} ${body}`)
    }
    const data = (await resp.json()) as { ok: boolean; result?: TelegramUser }
    if (!data.ok || !data.result) {
      throw new Error("Telegram getMe not ok")
    }
    return data.result
  }

  return { getUpdates, sendMessage, getMe }
}
