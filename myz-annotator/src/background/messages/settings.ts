import { Settings } from "../settings";
import { readSettings, writeSettings } from "../storage";
import { applyVectoriaSettings } from "../vectoria-index";
import { registerMessageHandler } from "./handler";

export function initializeSettingsMessageHandlers() {
  registerMessageHandler("myz:getSettings", async () => {
    return readSettings();
  });

  registerMessageHandler(
    "myz:updateSettings",
    async (payload: Partial<Settings>) => {
      const current = await readSettings();
      const patch: Partial<Settings> = payload ? { ...payload } : {};
      const configKeys: (keyof Settings)[] = [
        "vectorUseLocalModel",
        "vectorOpenAiEndpoint",
        "vectorOpenAiApiKey",
        "vectorOpenAiModel",
        "vectorMaxChars",
      ];
      const configChanged = configKeys.some(
        (key) => key in patch && patch[key] !== current[key],
      );
      if (patch.vectorSearchEnabled === false || configChanged) {
        patch.vectorModelReady = false;
      }
      const updated = await writeSettings(patch);
      applyVectoriaSettings(updated);
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
