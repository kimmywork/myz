import type { MyZRecord } from "@myz/shared/types";

export function parseTags(value: string): string[] {
  if (!value) return [];
  return value
    .split(/[,#]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag.slice(1) : tag));
}

export function recordToMarkdown(record: MyZRecord): string {
  const tags =
    Array.isArray(record?.tags) && record.tags.length
      ? ` #${record.tags.join(" #")}`
      : "";
  const quote = (record?.text || "")
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  const note = record?.note ? `\n\n${record.note}` : "";
  const link = record?.sourceUrl || record?.url || "";
  const title = record?.title || record?.hostname || "页面";
  return `- **${title}**${tags} ([链接](${link}))\n${quote}${note}`;
}
