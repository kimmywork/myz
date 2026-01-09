import { defineStore } from "pinia";
import { reactive, ref } from "vue";
import { Settings } from "@/background/settings.js";
import { sendMessage } from "@/shared/messaging.js";
import { DEFAULT_COLOR, DEFAULT_HIGHLIGHT_STYLE } from "@/shared/types.js";
import { LOCAL_TOOL_NAMES } from "@/background/ai/tools/localDefinitions.js";

export const useSettingsStore = defineStore("settings", () => {
  const settings: Settings = reactive({
    dashboardView: "cards",
    colorPalette: [
      "#b58900",
      "#ef476f",
      "#9f7aea",
      "#38bdf8",
      "#34d399",
    ],
    aiAssistantEnabled: false,
    aiProviders: [],
    aiAgents: {
      conversation: { target: null, temperature: 0.7, compressImages: false },
      insights: { target: null, temperature: 0.7 },
    },
    aiMcpServers: [],
    aiLocalTools: {
      enabledToolNames: LOCAL_TOOL_NAMES.slice(),
      mode: "manual",
      autoSelectorTarget: null,
    },
    vectorSearch: {
      enabled: false,
      target: null,
      lastTest: null,
      matchThreshold: 0.5,
    },
    lastUsedColor: DEFAULT_COLOR,
    lastUsedStyle: DEFAULT_HIGHLIGHT_STYLE,
    socialImport: {
      twitter: {
        profileUrl: "",
      },
      mastodon: {
        profileUrl: "",
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
        aiAssistantEnabled: Boolean(result.aiAssistantEnabled),
        aiProviders: Array.isArray(result.aiProviders)
          ? result.aiProviders.map((p) => ({ ...p }))
          : [],
        aiAgents:
          result.aiAgents && typeof result.aiAgents === "object"
            ? {
                conversation: {
                  target: result.aiAgents.conversation?.target || null,
                  temperature:
                    typeof result.aiAgents.conversation?.temperature === "number"
                      ? result.aiAgents.conversation.temperature
                      : 0.7,
                  compressImages:
                    typeof result.aiAgents.conversation?.compressImages === "boolean"
                      ? result.aiAgents.conversation.compressImages
                      : false,
                },
                insights: {
                  target: result.aiAgents.insights?.target || null,
                  temperature:
                    typeof result.aiAgents.insights?.temperature === "number"
                      ? result.aiAgents.insights.temperature
                      : 0.7,
                },
              }
            : settings.aiAgents,
        aiMcpServers: Array.isArray(result.aiMcpServers)
          ? result.aiMcpServers.map((s) => ({ ...s }))
          : [],
        aiLocalTools:
          result.aiLocalTools && typeof result.aiLocalTools === "object"
            ? {
                enabledToolNames: Array.isArray(result.aiLocalTools.enabledToolNames)
                  ? result.aiLocalTools.enabledToolNames
                      .filter((name) => typeof name === "string" && name.trim())
                      .map((name) => name.trim())
                  : settings.aiLocalTools.enabledToolNames,
                mode: result.aiLocalTools.mode === "auto" ? "auto" : "manual",
                autoSelectorTarget:
                  result.aiLocalTools.autoSelectorTarget &&
                  typeof result.aiLocalTools.autoSelectorTarget === "object"
                    ? result.aiLocalTools.autoSelectorTarget
                    : null,
              }
            : settings.aiLocalTools,
        vectorSearch:
          result.vectorSearch && typeof result.vectorSearch === "object"
            ? {
                enabled: Boolean(result.vectorSearch.enabled),
                target: result.vectorSearch.target || null,
                lastTest: result.vectorSearch.lastTest || null,
                matchThreshold:
                  typeof (result.vectorSearch as any).matchThreshold === "number"
                    ? Math.min(
                        1,
                        Math.max(0.4, (result.vectorSearch as any).matchThreshold),
                      )
                    : settings.vectorSearch.matchThreshold,
              }
            : settings.vectorSearch,
        socialImport:
          result.socialImport && typeof result.socialImport === "object"
            ? {
                twitter: {
                  profileUrl:
                    typeof result.socialImport.twitter?.profileUrl === "string"
                      ? result.socialImport.twitter.profileUrl
                      : settings.socialImport.twitter.profileUrl,
                },
                mastodon: {
                  profileUrl:
                    typeof result.socialImport.mastodon?.profileUrl === "string"
                      ? result.socialImport.mastodon.profileUrl
                      : settings.socialImport.mastodon.profileUrl,
                },
              }
            : settings.socialImport,
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
        if (Array.isArray(updated.aiProviders)) {
          settings.aiProviders = updated.aiProviders.map((p) => ({ ...p }));
        }
        if ("aiAgents" in updated && updated.aiAgents) {
          settings.aiAgents = updated.aiAgents as any;
        }
        if (Array.isArray(updated.aiMcpServers)) {
          settings.aiMcpServers = updated.aiMcpServers.map((s) => ({ ...s }));
        }
        if ("aiLocalTools" in updated && updated.aiLocalTools) {
          settings.aiLocalTools = updated.aiLocalTools as any;
        }
        if ("vectorSearch" in updated && updated.vectorSearch) {
          settings.vectorSearch = updated.vectorSearch as any;
        }
        if ("socialImport" in updated) {
          settings.socialImport =
            updated.socialImport && typeof updated.socialImport === "object"
              ? {
                  twitter: {
                    profileUrl:
                      typeof updated.socialImport.twitter?.profileUrl ===
                      "string"
                        ? updated.socialImport.twitter.profileUrl
                        : settings.socialImport.twitter.profileUrl,
                  },
                  mastodon: {
                    profileUrl:
                      typeof updated.socialImport.mastodon?.profileUrl ===
                      "string"
                        ? updated.socialImport.mastodon.profileUrl
                        : settings.socialImport.mastodon.profileUrl,
                  },
                }
              : settings.socialImport;
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
