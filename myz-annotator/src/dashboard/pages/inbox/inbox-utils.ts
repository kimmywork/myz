import type { MyZRecord } from "@myz/shared/types";

export function excerpt(value: string | undefined, length = 180): string {
  const text = (value || "").replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

export function formatTime(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

export function hostOf(record: MyZRecord): string {
  if (record.hostname) return record.hostname;
  try {
    return new URL(record.url || "").hostname;
  } catch {
    return "";
  }
}

export function kindLabel(record: MyZRecord): string {
  if (record.kind === "bookmark") return "书签";
  if (record.kind === "clip") return "摘录";
  return "划线";
}

export function snoozeTarget(bucket: "evening" | "tomorrow" | "week"): string {
  const now = new Date();
  const target = new Date(now);
  if (bucket === "evening") {
    target.setHours(20, 0, 0, 0);
    if (target.getTime() <= now.getTime()) {
      target.setTime(now.getTime() + 3 * 60 * 60 * 1000);
    }
  } else if (bucket === "tomorrow") {
    target.setDate(target.getDate() + 1);
    target.setHours(9, 0, 0, 0);
  } else {
    const day = target.getDay();
    const delta = (5 - day + 7) % 7 || 5;
    target.setDate(target.getDate() + delta);
    target.setHours(18, 0, 0, 0);
  }
  return target.toISOString();
}
