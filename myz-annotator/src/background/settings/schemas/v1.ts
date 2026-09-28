import { COLOR_SCHEMES, HIGHLIGHT_STYLES } from "@myz/shared/types";
import { SETTINGS_SCHEMA_VERSION } from "@myz/shared/versioning";
import { z } from "zod";

export const SettingsSchemaVersionV1 = SETTINGS_SCHEMA_VERSION;

const SyncS3SettingsSchema = z.object({
  endpoint: z.string(),
  region: z.string(),
  bucket: z.string(),
  accessKeyId: z.string(),
  secretAccessKey: z.string(),
  sessionToken: z.string().optional(),
  prefix: z.string().optional(),
});

const SyncSettingsSchema = z.object({
  enabled: z.boolean(),
  s3: SyncS3SettingsSchema,
});

export const SettingsSchemaV1 = z.object({
  dashboardView: z.enum(["cards", "list"]),
  colorScheme: z.nativeEnum(COLOR_SCHEMES),
  colorPalette: z.array(z.string()),
  lastUsedStyle: z.nativeEnum(HIGHLIGHT_STYLES),
  lastUsedColor: z.string(),
  sync: SyncSettingsSchema,
  inboxEnabled: z.boolean().optional(),
});

export const SettingsBundleSchemaV1 = z.object({
  schemaVersion: z.literal(SETTINGS_SCHEMA_VERSION),
  data: SettingsSchemaV1,
});

export type SettingsV1 = z.infer<typeof SettingsSchemaV1>;
export type SettingsBundleV1 = z.infer<typeof SettingsBundleSchemaV1>;
