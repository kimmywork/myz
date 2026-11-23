/**
 * Settings modal sections (§4.17 rendered as a modal, not a page).
 *
 * One source of truth for the modal's group nav, the section components and
 * the legacy `#/settings/...` deep links, so the three can never drift apart.
 */
export type SettingsSectionKey =
  "highlight-preferences" | "appearance" | "sync" | "inbox" | "ai" | "import";

export interface SettingsSectionItem {
  key: SettingsSectionKey;
  label: string;
  /** Legacy deep-link path; bookmarks and tests still land here. */
  path: string;
}

export interface SettingsSectionGroup {
  title: string;
  items: SettingsSectionItem[];
}

export const SETTINGS_SECTION_GROUPS: SettingsSectionGroup[] = [
  {
    title: "划线设置",
    items: [
      {
        key: "highlight-preferences",
        label: "划线偏好",
        path: "/settings/highlight/preferences",
      },
    ],
  },
  {
    title: "外观",
    items: [
      { key: "appearance", label: "外观设置", path: "/settings/appearance" },
    ],
  },
  {
    title: "同步",
    items: [{ key: "sync", label: "加密同步", path: "/settings/sync" }],
  },
  {
    title: "采集",
    items: [
      { key: "inbox", label: "Inbox", path: "/settings/inbox" },
      { key: "ai", label: "AI 解读", path: "/settings/ai" },
    ],
  },
  {
    title: "数据",
    items: [{ key: "import", label: "导入", path: "/settings/import" }],
  },
];

export const DEFAULT_SETTINGS_SECTION: SettingsSectionKey =
  "highlight-preferences";

/** Maps a legacy `#/settings/...` path to its modal section. */
export function settingsSectionForPath(path: string): SettingsSectionKey {
  // Router matching ignores a trailing slash; the raw path does not.
  const normalized = path.replace(/\/+$/, "");
  for (const group of SETTINGS_SECTION_GROUPS) {
    for (const item of group.items) {
      if (item.path === normalized) return item.key;
    }
  }
  return DEFAULT_SETTINGS_SECTION;
}
