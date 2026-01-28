const OFFSCREEN_DOC_URL = "src/offscreen/code-execution.html"

const DEFAULT_TIMEOUT_MS = 1000
const MIN_TIMEOUT_MS = 100
const MAX_TIMEOUT_MS = 5000

const DEFAULT_MAX_RESULT_CHARS = 2000
const MIN_RESULT_CHARS = 200
const MAX_RESULT_CHARS = 8000

const MAX_CODE_CHARS = 5000

let offscreenInitPromise: Promise<void> | null = null

function clampNumber(value: any, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback
  return Math.min(max, Math.max(min, Math.floor(value)))
}

async function ensureOffscreenDocument() {
  if (!chrome.offscreen?.createDocument) {
    throw new Error("当前浏览器不支持 offscreen 文档。")
  }

  const hasDocument = await chrome.offscreen.hasDocument?.().catch(() => false)
  if (hasDocument) return

  if (!offscreenInitPromise) {
    offscreenInitPromise = chrome.offscreen
      .createDocument({
        url: chrome.runtime.getURL(OFFSCREEN_DOC_URL),
        reasons: ["IFRAME_SCRIPTING"],
        justification: "Run sandboxed iframe to evaluate agent-provided JavaScript.",
      })
      .catch((error) => {
        offscreenInitPromise = null
        throw error
      })
  }

  await offscreenInitPromise
}

export interface SandboxedCodeResult {
  resultText: string
  resultType: string
  truncated: boolean
  consoleLogs: string[]
  timeoutMs: number
  maxResultChars: number
}

export async function executeSandboxedCode(args: {
  code?: string
  timeoutMs?: number
  maxResultChars?: number
}): Promise<SandboxedCodeResult> {
  const rawCode = typeof args.code === "string" ? args.code : ""
  const code = rawCode.trim()

  if (!code) {
    throw new Error("请输入要执行的 JavaScript 代码。")
  }

  if (code.length > MAX_CODE_CHARS) {
    throw new Error(`代码过长（最多 ${MAX_CODE_CHARS} 字符）。`)
  }

  const timeoutMs = clampNumber(args.timeoutMs, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS, DEFAULT_TIMEOUT_MS)
  const maxResultChars = clampNumber(
    args.maxResultChars,
    MIN_RESULT_CHARS,
    MAX_RESULT_CHARS,
    DEFAULT_MAX_RESULT_CHARS,
  )

  await ensureOffscreenDocument()

  const response = await chrome.runtime
    .sendMessage({
      type: "myz:executeSandboxedCode",
      payload: { code, timeoutMs, maxResultChars },
    })
    .catch((error) => {
      throw new Error(`无法发送执行请求: ${error?.message || error}`)
    })

  if (!response || typeof response !== "object") {
    throw new Error("Sandbox 无响应。")
  }

  if (!response.ok) {
    throw new Error(response.error || "Sandbox 执行失败。")
  }

  return {
    resultText: typeof response.resultText === "string" ? response.resultText : "",
    resultType: typeof response.resultType === "string" ? response.resultType : "unknown",
    truncated: Boolean(response.truncated),
    consoleLogs: Array.isArray(response.consoleLogs)
      ? response.consoleLogs.filter((log: unknown) => typeof log === "string")
      : [],
    timeoutMs,
    maxResultChars,
  }
}
