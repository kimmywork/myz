import { z } from "zod";

import { AUTO_HIGHLIGHT_CATEGORIES, HIGHLIGHT_STYLES } from "@/shared/types";
import { SETTINGS_SCHEMA_VERSION } from "@/shared/versioning";

export const SettingsSchemaVersionV1 = SETTINGS_SCHEMA_VERSION;

const AutoHighlightCategoryStyleSchema = z.object({
  style: z.nativeEnum(HIGHLIGHT_STYLES),
  color: z.string(),
});

const AutoHighlightCategoryStylesSchema = z
  .object({
    [AUTO_HIGHLIGHT_CATEGORIES.CONCEPTUAL]: AutoHighlightCategoryStyleSchema,
    [AUTO_HIGHLIGHT_CATEGORIES.STRUCTURAL]: AutoHighlightCategoryStyleSchema,
    [AUTO_HIGHLIGHT_CATEGORIES.BEHAVIOURAL]: AutoHighlightCategoryStyleSchema,
  })
  .partial();

const AutoHighlightConfigSchema = z.object({
  categoryStyles: AutoHighlightCategoryStylesSchema.optional(),
});

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
  colorPalette: z.array(z.string()),
  lastUsedStyle: z.nativeEnum(HIGHLIGHT_STYLES),
  lastUsedColor: z.string(),
  sync: SyncSettingsSchema,
  autoHighlight: AutoHighlightConfigSchema,
});

export const SettingsBundleSchemaV1 = z.object({
  schemaVersion: z.literal(SETTINGS_SCHEMA_VERSION),
  data: SettingsSchemaV1,
});

export type SettingsV1 = z.infer<typeof SettingsSchemaV1>;
export type SettingsBundleV1 = z.infer<typeof SettingsBundleSchemaV1>;
