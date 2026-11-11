import { Archive, Clock, Inbox } from "@lucide/vue";
import type { LucideIcon } from "@lucide/vue";
import type { StatusPillTone } from "@myz/dashboard-ui";
import { formatDateTime } from "@myz/shared/recordDisplay";
import type { InboxQueueItem } from "@/background/messages/inbox";

export function excerpt(value: string | undefined, length = 180): string {
  const text = (value || "").replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length)}…` : text;
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

/** Status pill content shared by the row and the detail panel (§4.29). */
export function inboxStatusPill(item: InboxQueueItem): {
  label: string;
  tone: StatusPillTone;
  icon: LucideIcon | undefined;
} {
  if (item.state?.status === "snoozed" && item.state.snoozedUntil) {
    return {
      label: `稍后 · ${formatDateTime(item.state.snoozedUntil)}`,
      tone: "neutral",
      icon: Clock,
    };
  }
  if (item.status === "pending") {
    return { label: "待处理", tone: "info", icon: Inbox };
  }
  if (item.status === "archived") {
    return { label: "已归档", tone: "neutral", icon: Archive };
  }
  return { label: "已保留", tone: "neutral", icon: undefined };
}
