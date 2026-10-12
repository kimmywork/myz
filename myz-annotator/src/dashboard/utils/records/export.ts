// Shared markdown export so popup/inbox/readers copy identical text (D7/CONS2).
export { recordToMarkdown } from "@myz/shared/recordDisplay";

export function parseTags(value: string): string[] {
  if (!value) return [];
  return value
    .split(/[,#]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag.slice(1) : tag));
}
