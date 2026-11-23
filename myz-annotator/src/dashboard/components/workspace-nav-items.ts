import { BookOpen, Image, Inbox, Library, Settings } from "@lucide/vue";
import type { NavRailItem } from "@myz/dashboard-ui";

/**
 * Rail destinations (§4.27), also the source of the <640px bottom bar.
 * 设置 is deliberately not a rail destination: it opens a modal from the rail
 * footer, below the theme toggle (§4.17 as a modal).
 */
export const WORKSPACE_NAV_ITEMS: NavRailItem[] = [
  { key: "highlights", label: "文库", to: "/highlights", icon: Library },
  { key: "inbox", label: "Inbox", to: "/inbox", icon: Inbox },
  { key: "readers", label: "阅读", to: "/readers", icon: BookOpen },
  { key: "assets", label: "素材", to: "/assets", icon: Image },
];

/** The bottom bar keeps 设置 as its fifth entry; it opens the modal. */
export const SETTINGS_NAV_ITEM = {
  key: "settings",
  label: "设置",
  icon: Settings,
};

/** Which rail entry is current for a dashboard route path. */
export function activeNavKey(path: string): string {
  if (path.startsWith("/inbox")) return "inbox";
  if (path.startsWith("/readers")) return "readers";
  if (path.startsWith("/assets")) return "assets";
  return "highlights";
}
