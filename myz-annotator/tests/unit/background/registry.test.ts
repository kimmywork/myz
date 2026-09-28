import { MyZRecordRegistry } from "@myz/shared/recordRegistry";
import {
  RECORD_SCHEMA_VERSION,
  SETTINGS_SCHEMA_VERSION,
} from "@myz/shared/versioning";
import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS } from "@/background/constants";
import {
  SettingsRegistry,
  SettingsBundleRegistry,
} from "@/background/settings/registry";

describe("schema registry mapping", () => {
  it("should map record schema by version", () => {
    expect(MyZRecordRegistry.latestVersion).toBe(RECORD_SCHEMA_VERSION);
    const schema = MyZRecordRegistry.versions[RECORD_SCHEMA_VERSION];
    expect(schema).toBeDefined();
    const result = schema.safeParse({
      schemaVersion: RECORD_SCHEMA_VERSION,
      id: "1",
      kind: "highlight",
      text: "",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
      url: "https://example.com",
    });
    expect(result.success).toBe(true);
  });

  it("should map settings schemas by version", () => {
    expect(SettingsRegistry.latestVersion).toBe(SETTINGS_SCHEMA_VERSION);
    const settingsSchema = SettingsRegistry.versions[SETTINGS_SCHEMA_VERSION];
    expect(settingsSchema).toBeDefined();
    expect(settingsSchema.safeParse(DEFAULT_SETTINGS).success).toBe(true);

    expect(SettingsBundleRegistry.latestVersion).toBe(SETTINGS_SCHEMA_VERSION);
    const bundleSchema =
      SettingsBundleRegistry.versions[SETTINGS_SCHEMA_VERSION];
    expect(bundleSchema).toBeDefined();
    const bundleResult = bundleSchema.safeParse({
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      data: DEFAULT_SETTINGS,
    });
    expect(bundleResult.success).toBe(true);
  });
});
