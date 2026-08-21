import { defineStore } from "pinia";
import { reactive, ref } from "vue";
import { Settings } from "@/background/settings.js";
import { sendMessage } from "@/shared/messaging.js";
import { normalizeSyncSettings } from "@/shared/sync";
import {
  DEFAULT_COLOR,
  DEFAULT_HIGHLIGHT_STYLE,
  HIGHLIGHT_STYLES,
} from "@/shared/types.js";

export const useSettingsStore = defineStore("settings", () => {
  const settings: Settings = reactive({
    dashboardView: "cards",
    colorPalette: ["#b58900", "#ef476f", "#9f7aea", "#38bdf8", "#34d399"],
    lastUsedColor: DEFAULT_COLOR,
    lastUsedStyle: DEFAULT_HIGHLIGHT_STYLE,
    sync: {
      enabled: false,
      s3: {
        endpoint: "",
        region: "",
        bucket: "",
        accessKeyId: "",
        secretAccessKey: "",
        sessionToken: "",
        prefix: "",
      },
    },
  });

  const settingsStatus = ref("");
  const timers = new Map();

  function setTimedStatus(
    target: typeof settingsStatus,
    message: string,
    duration = 3000,
  ) {
    target.value = message;
    if (timers.has(target)) {
      clearTimeout(timers.get(target));
    }
    if (duration > 0) {
      const id = setTimeout(() => {
        target.value = "";
        timers.delete(target);
      }, duration);
      timers.set(target, id);
    }
  }

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
        colorPalette: Array.isArray(result.colorPalette)
          ? result.colorPalette.filter((c) => typeof c === "string" && c.trim())
          : settings.colorPalette,
        sync: normalizeSyncSettings(result.sync),
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
          settings.sync =
            updated.sync && typeof updated.sync === "object"
              ? {
                  enabled: Boolean(updated.sync.enabled),
                  s3:
                    updated.sync.s3 && typeof updated.sync.s3 === "object"
                      ? {
                          endpoint:
                            typeof updated.sync.s3.endpoint === "string"
                              ? updated.sync.s3.endpoint
                              : settings.sync.s3.endpoint,
                          region:
                            typeof updated.sync.s3.region === "string"
                              ? updated.sync.s3.region
                              : settings.sync.s3.region,
                          bucket:
                            typeof updated.sync.s3.bucket === "string"
                              ? updated.sync.s3.bucket
                              : settings.sync.s3.bucket,
                          accessKeyId:
                            typeof updated.sync.s3.accessKeyId === "string"
                              ? updated.sync.s3.accessKeyId
                              : settings.sync.s3.accessKeyId,
                          secretAccessKey:
                            typeof updated.sync.s3.secretAccessKey === "string"
                              ? updated.sync.s3.secretAccessKey
                              : settings.sync.s3.secretAccessKey,
                          sessionToken:
                            typeof updated.sync.s3.sessionToken === "string"
                              ? updated.sync.s3.sessionToken
                              : settings.sync.s3.sessionToken,
                          prefix:
                            typeof updated.sync.s3.prefix === "string"
                              ? updated.sync.s3.prefix
                              : settings.sync.s3.prefix,
                        }
                      : settings.sync.s3,
                }
              : settings.sync;
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
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
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
