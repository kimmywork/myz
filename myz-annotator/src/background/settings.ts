import { HIGHLIGHT_STYLES } from "@/shared/types";
import { type SettingsSchemaVersion } from "@/shared/versioning";

export interface SyncS3Settings {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  prefix?: string;
}

export interface SyncSettings {
  enabled: boolean;
  s3: SyncS3Settings;
}

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
