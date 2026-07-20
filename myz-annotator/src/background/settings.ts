import { AUTO_HIGHLIGHT_CATEGORIES, HIGHLIGHT_STYLES } from "@/shared/types";
import { type SettingsSchemaVersion } from "@/shared/versioning";

export type AutoHighlightCategory = `${AUTO_HIGHLIGHT_CATEGORIES}`;

export interface AutoHighlightCategoryStyle {
  style: HIGHLIGHT_STYLES;
  color: string;
}

export type AutoHighlightCategoryStyles = Record<
  AutoHighlightCategory,
  AutoHighlightCategoryStyle
>;

export interface AutoHighlightAgentConfig {
  maxHighlights: number;
  categoryStyles?: AutoHighlightCategoryStyles;
}

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
  autoHighlight: AutoHighlightAgentConfig;
  sync: SyncSettings;
}

export interface SettingsBundle {
  schemaVersion: SettingsSchemaVersion;
  data: Settings;
}
