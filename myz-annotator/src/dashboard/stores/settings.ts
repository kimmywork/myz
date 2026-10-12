import { sendMessage } from "@myz/shared/messaging";
import { COLOR_SCHEMES, HIGHLIGHT_STYLES } from "@myz/shared/types";
import { normalizeSyncSettings } from "@myz/sync-core/settings";
import { defineStore } from "pinia";
import { reactive, ref } from "vue";
import { DEFAULT_SETTINGS } from "@/background/constants.js";
import { Settings } from "@/background/settings.js";
import {
  setTimedStatus,
  clearAllTimedStatus,
} from "@/dashboard/utils/setTimedStatus.js";

export const useSettingsStore = defineStore("settings", () => {
  // Seed from the canonical defaults so new settings only need to be added in
  // one place (`background/constants.ts`).
  const settings: Settings = reactive({
    ...DEFAULT_SETTINGS,
    colorPalette: [...DEFAULT_SETTINGS.colorPalette],
    sync: {
      ...DEFAULT_SETTINGS.sync,
      s3: { ...DEFAULT_SETTINGS.sync.s3 },
    },
  });

  const settingsStatus = ref("");

  async function initialize() {
    await loadSettings();
  }

  async function loadSettings() {
    try {
      const result: Settings = await sendMessage("myz:getSettings");
      if (!result) {
        return;
      }
      Object.assign(settings, {
        dashboardView: result.dashboardView || settings.dashboardView,
        colorScheme: Object.values(COLOR_SCHEMES).includes(
          result.colorScheme as COLOR_SCHEMES,
        )
          ? result.colorScheme
          : settings.colorScheme,
        colorPalette: Array.isArray(result.colorPalette)
          ? result.colorPalette.filter((c) => typeof c === "string" && c.trim())
          : settings.colorPalette,
        sync: normalizeSyncSettings(result.sync),
        syncSetupSeen: result.syncSetupSeen === true,
        inboxEnabled: result.inboxEnabled !== false,
        inboxReminderEnabled: result.inboxReminderEnabled !== false,
        lastUsedColor:
          typeof result.lastUsedColor === "string" &&
          result.lastUsedColor.trim()
            ? result.lastUsedColor
            : settings.lastUsedColor,
        lastUsedStyle:
          result.lastUsedStyle &&
          Object.values(HIGHLIGHT_STYLES).includes(result.lastUsedStyle)
            ? result.lastUsedStyle
            : settings.lastUsedStyle,
      });
    } catch (error) {
      console.error("Failed to load settings", error);
    }
  }

  async function saveSettings(payload: Partial<Settings>) {
    settingsStatus.value = "保存中…";
    try {
      const updated = await sendMessage<Partial<Settings>, Partial<Settings>>(
        "myz:updateSettings",
        payload,
      );
      if (updated) {
        Object.assign(settings, {
          ...settings,
          ...updated,
        });
        if (Array.isArray(updated.colorPalette)) {
          settings.colorPalette = updated.colorPalette.filter(
            (c) => typeof c === "string" && c.trim(),
          );
        }
        if ("sync" in updated) {
          settings.sync = normalizeSyncSettings(updated.sync);
        }
      }
      setTimedStatus(settingsStatus, "设置已保存", 3000);
    } catch (error) {
      setTimedStatus(
        settingsStatus,
        `保存失败：${(error as Error).message}`,
        4000,
      );
      throw error;
    }
  }

  function cleanup() {
    clearAllTimedStatus();
  }

  return {
    settings,
    settingsStatus,
    initialize,
    loadSettings,
    saveSettings,
    cleanup,
  };
});
