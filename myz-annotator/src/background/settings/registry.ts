import { SettingsSchemaV1, SettingsBundleSchemaV1 } from "./schemas";
import { createSchemaRegistry } from "@/shared/schemaRegistry";
import { SETTINGS_SCHEMA_VERSION } from "@/shared/versioning";

export const SettingsRegistry = createSchemaRegistry({
  latestVersion: SETTINGS_SCHEMA_VERSION,
  versions: {
    [SETTINGS_SCHEMA_VERSION]: SettingsSchemaV1,
  },
});

export const SettingsBundleRegistry = createSchemaRegistry({
  latestVersion: SETTINGS_SCHEMA_VERSION,
  versions: {
    [SETTINGS_SCHEMA_VERSION]: SettingsBundleSchemaV1,
  },
});
