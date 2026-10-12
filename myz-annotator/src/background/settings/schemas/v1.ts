import { COLOR_SCHEMES, HIGHLIGHT_STYLES } from "@myz/shared/types";
import { SETTINGS_SCHEMA_VERSION } from "@myz/shared/versioning";
import { SyncSettingsSchema } from "@myz/sync-core/settings";
import { z } from "zod";

export const SettingsSchemaVersionV1 = SETTINGS_SCHEMA_VERSION;

export const SettingsSchemaV1 = z.object({
  dashboardView: z.enum(["cards", "list"]),
  colorScheme: z.nativeEnum(COLOR_SCHEMES),
  colorPalette: z.array(z.string()),
  lastUsedStyle: z.nativeEnum(HIGHLIGHT_STYLES),
  lastUsedColor: z.string(),
  sync: SyncSettingsSchema,
  syncSetupSeen: z.boolean().optional(),
  inboxEnabled: z.boolean().optional(),
  inboxReminderEnabled: z.boolean().optional(),
});

export const SettingsBundleSchemaV1 = z.object({
  schemaVersion: z.literal(SETTINGS_SCHEMA_VERSION),
  data: SettingsSchemaV1,
});

export type SettingsV1 = z.infer<typeof SettingsSchemaV1>;
export type SettingsBundleV1 = z.infer<typeof SettingsBundleSchemaV1>;
