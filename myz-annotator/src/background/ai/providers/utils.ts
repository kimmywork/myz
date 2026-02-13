export function normalizeBaseUrl(value: string): string {
  return typeof value === "string" ? value.replace(/\/+$/, "") : ""
}

export function parseDataUrl(value: string): { mimeType: string; data: string } | null {
  if (typeof value !== "string") return null
  const match = value.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  return { mimeType: match[1], data: match[2] }
}

export function coerceContentToText(content: any): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .map((part) => {
      if (!part) return ""
      if (part.type === "text" && typeof part.text === "string") return part.text
      if (part.type === "input_text" && typeof part.text === "string") return part.text
      if (part.type === "output_text" && typeof part.text === "string") return part.text
      if (part.type === "image_url" && part.image_url?.url) {
        return `[Image] ${part.image_url.url}`
      }
      return ""
    })
    .filter(Boolean)
    .join("\n")
}

export function safeJsonParse(value: string): any {
  if (typeof value !== "string") return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

