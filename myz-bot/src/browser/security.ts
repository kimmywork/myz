import type { SecurityCheckResult } from "./types"

const BLOCKED_URL_PATTERNS = [
  /^file:\/\//i,
  /^data:/i,
  /^javascript:/i,
  /localhost/i,
  /127\.0\.0\.1/i,
  /0\.0\.0\.0/i,
  /192\.168\./i,
  /10\.\d+\./i,
  /172\.(1[6-9]|2\d|3[01])\./i,
]

const BLOCKED_EVAL_PATTERNS = [
  /require\s*\(/i,
  /process\./i,
  /import\s*\(/i,
  /fetch\s*\(\s*['"]file/i,
  /XMLHttpRequest/i,
  /navigator\.sendBeacon/i,
  /document\.cookie/i,
  /localStorage|sessionStorage/i,
]

export function validateUrl(url: string): SecurityCheckResult {
  if (!url || typeof url !== "string") {
    return { ok: false, reason: "URL 不能为空" }
  }
  const trimmed = url.trim()
  if (!/^https?:\/\//i.test(trimmed)) {
    return { ok: false, reason: "仅支持 http 和 https 协议" }
  }
  for (const pattern of BLOCKED_URL_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { ok: false, reason: `URL 匹配阻止规则: ${pattern.source}` }
    }
  }
  return { ok: true }
}

export function validateJsExpression(code: string): SecurityCheckResult {
  if (!code || typeof code !== "string") {
    return { ok: false, reason: "表达式不能为空" }
  }
  for (const pattern of BLOCKED_EVAL_PATTERNS) {
    if (pattern.test(code)) {
      return { ok: false, reason: `表达式匹配阻止规则: ${pattern.source}` }
    }
  }
  return { ok: true }
}

export function validateSelector(selector: string): SecurityCheckResult {
  if (!selector || typeof selector !== "string") {
    return { ok: false, reason: "选择器不能为空" }
  }
  if (/[;{}]/.test(selector)) {
    return { ok: false, reason: "选择器包含非法字符" }
  }
  return { ok: true }
}

export function sanitizeTextContent(text: string, maxChars = 10000): string {
  if (typeof text !== "string") return ""
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n...truncated`
}
