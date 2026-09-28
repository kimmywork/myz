import { COLOR_SCHEMES, HIGHLIGHT_STYLES } from "@myz/shared/types";
import { type SettingsSchemaVersion } from "@myz/shared/versioning";
import type { SyncS3Settings, SyncSettings } from "@myz/sync-core/settings";

export type { SyncS3Settings, SyncSettings };

export interface Settings {
  dashboardView: "cards" | "list";
  colorScheme: COLOR_SCHEMES;
  colorPalette: string[];
  lastUsedStyle: HIGHLIGHT_STYLES;
  lastUsedColor: string;
  sync: SyncSettings;
  /** Inbox is enabled by default; when false new captures go straight to kept. */
  inboxEnabled?: boolean;
}

export interface SettingsBundle {
  schemaVersion: SettingsSchemaVersion;
  data: Settings;
}
