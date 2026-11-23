// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS_SECTION,
  settingsSectionForPath,
} from "@/dashboard/pages/settings/settings-sections";

describe("settingsSectionForPath", () => {
  it("maps legacy deep-link paths to their section", () => {
    expect(settingsSectionForPath("/settings/appearance")).toBe("appearance");
    expect(settingsSectionForPath("/settings/sync")).toBe("sync");
    expect(settingsSectionForPath("/settings/highlight/preferences")).toBe(
      "highlight-preferences",
    );
  });

  it("ignores a trailing slash like the router does", () => {
    expect(settingsSectionForPath("/settings/appearance/")).toBe("appearance");
    expect(settingsSectionForPath("/settings/import/")).toBe("import");
  });

  it("falls back to the default section for unknown paths", () => {
    expect(settingsSectionForPath("/settings/nope")).toBe(
      DEFAULT_SETTINGS_SECTION,
    );
    expect(settingsSectionForPath("/settings")).toBe(DEFAULT_SETTINGS_SECTION);
    expect(settingsSectionForPath("/")).toBe(DEFAULT_SETTINGS_SECTION);
  });
});
