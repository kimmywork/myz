import { ensureInboxReminderAlarm } from "../inbox/reminder";
import { Settings } from "../settings";
import { pickPublicSettings } from "../settings-public";
import { readSettings, writeSettings } from "../storage";
import { ensureSyncAlarm } from "../sync/scheduler";
import { registerMessageHandler } from "./handler";
import { changeBus } from "@/messaging/changes";

/**
 * Whitelist of settings keys content scripts may persist. Anything else in a
 * `myz:updateHighlightPreference` payload is ignored so a compromised content
 * script cannot rewrite sync credentials or unrelated settings.
 */
type HighlightPreferencePatch = Partial<
  Pick<Settings, "colorPalette" | "lastUsedColor" | "lastUsedStyle">
>;

function pickHighlightPreferencePatch(
  payload: Partial<Settings> | undefined,
): HighlightPreferencePatch {
  const patch: HighlightPreferencePatch = {};
  if (!payload) return patch;
  if (payload.colorPalette !== undefined) {
    patch.colorPalette = payload.colorPalette;
  }
  if (payload.lastUsedColor !== undefined) {
    patch.lastUsedColor = payload.lastUsedColor;
  }
  if (payload.lastUsedStyle !== undefined) {
    patch.lastUsedStyle = payload.lastUsedStyle;
  }
  return patch;
}

export function initializeSettingsMessageHandlers() {
  // Full settings are privileged: they include sealed S3 credentials. Only
  // trusted extension pages (dashboard/options) may request them.
  registerMessageHandler("myz:getSettings", async () => {
    return readSettings();
  });

  // Non-privileged read path for content scripts: highlight prefs only.
  registerMessageHandler("myz:getPublicSettings", async () => {
    return pickPublicSettings(await readSettings());
  });

  registerMessageHandler(
    "myz:updateSettings",
    async (payload: Partial<Settings>) => {
      const patch: Partial<Settings> = payload ? { ...payload } : {};
      const updated = await writeSettings(patch);
      changeBus.publish({ domain: "settings" });
      if (patch.sync) {
        await ensureSyncAlarm();
      }
      if ("inboxEnabled" in patch || "inboxReminderEnabled" in patch) {
        await ensureInboxReminderAlarm();
      }
      return updated;
    },
  );

  registerMessageHandler(
    "myz:updatePalette",
    async (payload: Partial<Settings>) => {
      if (!payload) {
        return readSettings();
      }
      return writeSettings(payload);
    },
  );

  // Non-privileged write path for content scripts. Only the whitelisted
  // highlight preference keys are accepted; the result stays public-only.
  registerMessageHandler(
    "myz:updateHighlightPreference",
    async (payload: Partial<Settings>) => {
      const updated = await writeSettings(
        pickHighlightPreferencePatch(payload),
      );
      return pickPublicSettings(updated);
    },
  );
}
