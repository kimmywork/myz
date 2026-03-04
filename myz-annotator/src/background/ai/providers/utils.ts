import { isRecord } from "@/shared/typeUtils"

export function normalizeBaseUrl(value: string): string {
  return typeof value === "string" ? value.replace(/\/+$/, "") : "";
}

export function parseDataUrl(
  value: string,
): { mimeType: string; data: string } | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

export function coerceContentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!isRecord(part)) return "";
      const kind = typeof part.type === "string" ? part.type : "";
      if (
        (kind === "text" || kind === "input_text" || kind === "output_text") &&
        typeof part.text === "string"
      ) {
        return part.text;
      }
      if (kind === "image_url") {
        const imageUrl =
          isRecord(part.image_url) && typeof part.image_url.url === "string"
            ? part.image_url.url
            : "";
        if (imageUrl) {
          return `[Image] ${imageUrl}`;
        }
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

export function safeJsonParse(value: string): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
