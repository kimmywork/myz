import { HIGHLIGHT_STYLES } from "@myz/shared/types";
import { type SettingsSchemaVersion } from "@myz/shared/versioning";
import type { SyncS3Settings, SyncSettings } from "@myz/sync-core/settings";

export type { SyncS3Settings, SyncSettings };

export interface Settings {
  dashboardView: "cards" | "list";
  colorPalette: string[];
  lastUsedStyle: HIGHLIGHT_STYLES;
  lastUsedColor: string;
  sync: SyncSettings;
}

export interface SettingsBundle {
  schemaVersion: SettingsSchemaVersion;
  data: Settings;
}
