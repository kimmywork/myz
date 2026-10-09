import type { InboxStatus } from "@myz/shared/inbox";

export type Tab = "pending" | "snoozed" | "marked";

export interface UndoState {
  targetId: string;
  prevStatus: InboxStatus;
  prevSnoozedUntil?: string;
  wasMarked: boolean;
  label: string;
}

export const TABS: Array<{ key: Tab; label: string }> = [
  { key: "pending", label: "待处理" },
  { key: "snoozed", label: "稍后处理" },
  { key: "marked", label: "已标记" },
];

export const LIST_PAGE_SIZE = 40;
export const TAG_DISPLAY_CAP = 30;
