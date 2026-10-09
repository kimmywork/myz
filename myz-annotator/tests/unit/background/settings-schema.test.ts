import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/background/constants.js";
import { SettingsSchemaV1 } from "@/background/settings/schemas/v1.js";

describe("settings colorScheme", () => {
  it("defaults to paper", () => {
    expect(DEFAULT_SETTINGS.colorScheme).toBe("paper");
    expect(SettingsSchemaV1.parse(DEFAULT_SETTINGS).colorScheme).toBe("paper");
  });

  it("accepts every declared scheme", () => {
    for (const scheme of ["paper", "slate", "celadon", "ochre"] as const) {
      const parsed = SettingsSchemaV1.parse({
        ...DEFAULT_SETTINGS,
        colorScheme: scheme,
      });
      expect(parsed.colorScheme).toBe(scheme);
    }
  });

  it("rejects an unknown scheme", () => {
    const result = SettingsSchemaV1.safeParse({
      ...DEFAULT_SETTINGS,
      colorScheme: "neon",
    });
    expect(result.success).toBe(false);
  });
});

describe("settings syncSetupSeen", () => {
  it("defaults to false", () => {
    expect(DEFAULT_SETTINGS.syncSetupSeen).toBe(false);
    expect(SettingsSchemaV1.parse(DEFAULT_SETTINGS).syncSetupSeen).toBe(false);
  });

  it("accepts a boolean flag", () => {
    const parsed = SettingsSchemaV1.parse({
      ...DEFAULT_SETTINGS,
      syncSetupSeen: true,
    });
    expect(parsed.syncSetupSeen).toBe(true);
  });
});
