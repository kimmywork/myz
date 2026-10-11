import { RECORD_KINDS } from "@myz/shared/types";
import type { ModalOpenOptions } from "@/content/stores/modal-store.js";

export function uniqueNormalizedTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  tags?.forEach((tag) => {
    if (typeof tag !== "string") return;
    const normalized = tag.trim();
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(normalized);
  });
  return result;
}

function normalizeTagValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function mergeKnownTags(
  current: string[] = [],
  incoming: string[] = [],
): string[] {
  const base = Array.isArray(current) ? current : [];
  const extras = Array.isArray(incoming) ? incoming : [];
  const merged = new Set<string>();
  base.forEach((tag) => {
    const normalized = normalizeTagValue(tag);
    if (normalized) merged.add(normalized);
  });
  extras.forEach((tag) => {
    const normalized = normalizeTagValue(tag);
    if (normalized) merged.add(normalized);
  });
  return Array.from(merged).sort((a, b) => a.localeCompare(b));
}

export const titleText = (option: ModalOpenOptions) => {
  if (option.kind === RECORD_KINDS.CLIP) {
    return option.mode === "edit" ? "编辑摘录内容" : "保存摘录";
  }
  return option.mode === "edit" ? "编辑批注" : "添加批注";
};

export const previewText = (option: ModalOpenOptions): string =>
  option.preview || "";
