import { BookOpen, Inbox, Library, Settings } from "@lucide/vue";
import type { NavRailItem } from "@myz/dashboard-ui";

/** Rail destinations (§4.27). 素材 joins when that page exists (I6). */
export const WORKSPACE_NAV_ITEMS: NavRailItem[] = [
  { key: "highlights", label: "文库", to: "/highlights", icon: Library },
  { key: "inbox", label: "Inbox", to: "/inbox", icon: Inbox },
  { key: "readers", label: "阅读", to: "/readers", icon: BookOpen },
  { key: "settings", label: "设置", to: "/settings", icon: Settings },
];

/** Which rail entry is current for a dashboard route path. */
export function activeNavKey(path: string): string {
  if (path.startsWith("/inbox")) return "inbox";
  if (path.startsWith("/readers")) return "readers";
  if (path.startsWith("/settings")) return "settings";
  return "highlights";
}
