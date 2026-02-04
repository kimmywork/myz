import { Settings } from "../settings";
import { readSettings, writeSettings } from "../storage";
import { ensureSyncAlarm } from "../sync/scheduler";
import { registerMessageHandler } from "./handler";

export function initializeSettingsMessageHandlers() {
  registerMessageHandler("myz:getSettings", async () => {
    return readSettings();
  });

  registerMessageHandler(
    "myz:updateSettings",
    async (payload: Partial<Settings>) => {
      const patch: Partial<Settings> = payload ? { ...payload } : {};
      const updated = await writeSettings(patch);
      if (patch.sync) {
        await ensureSyncAlarm();
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
}
