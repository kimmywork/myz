import { defineStore } from "pinia";
import { reactive, ref } from "vue";
import { LOCAL_TOOL_NAMES } from "@/background/ai/tools/localDefinitions.js";
import { Settings } from "@/background/settings.js";
import { sendMessage } from "@/shared/messaging.js";
import {
  DEFAULT_COLOR,
  DEFAULT_COLORS,
  DEFAULT_HIGHLIGHT_STYLE,
  HIGHLIGHT_STYLES,
} from "@/shared/types.js";

export const useSettingsStore = defineStore("settings", () => {
  const settings: Settings = reactive({
    dashboardView: "cards",
    colorPalette: ["#b58900", "#ef476f", "#9f7aea", "#38bdf8", "#34d399"],
    aiAssistantEnabled: false,
    aiProviders: [],
    aiAgents: {
      conversation: {
        target: null,
        temperature: 0.7,
        compressImages: false,
        multimodalTarget: null,
        superpowerMode: false,
        contextCompressionThreshold: 80,
      },
      insights: { target: null, temperature: 0.7 },
      autoHighlight: {
        target: null,
        temperature: 0.4,
        maxHighlights: 15,
        categoryStyles: {
          conceptual: {
            style: HIGHLIGHT_STYLES.PAINT,
            color: DEFAULT_COLORS[0],
          },
          structural: {
            style: HIGHLIGHT_STYLES.UNDERLINE,
            color: DEFAULT_COLORS[3] || DEFAULT_COLORS[0],
          },
          behavioural: {
            style: HIGHLIGHT_STYLES.WAVY,
            color: DEFAULT_COLORS[1] || DEFAULT_COLORS[0],
          },
        },
      },
    },
    aiMcpServers: [],
    aiLocalTools: {
      enabledToolNames: LOCAL_TOOL_NAMES.slice(),
      mode: "manual",
      autoSelectorTarget: null,
    },
    aiSkills: {
      mode: "manual",
      autoSelectorTarget: null,
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
                    typeof result.aiAgents.conversation?.temperature ===
                    "number"
                      ? result.aiAgents.conversation.temperature
                      : 0.7,
                  compressImages:
                    typeof result.aiAgents.conversation?.compressImages ===
                    "boolean"
                      ? result.aiAgents.conversation.compressImages
                      : false,
                  superpowerMode:
                    typeof result.aiAgents.conversation?.superpowerMode ===
                    "boolean"
                      ? result.aiAgents.conversation.superpowerMode
                      : false,
                  multimodalTarget:
                    result.aiAgents.conversation?.multimodalTarget &&
                    typeof result.aiAgents.conversation.multimodalTarget ===
                      "object"
                      ? result.aiAgents.conversation.multimodalTarget
                      : null,
                  contextCompressionThreshold:
                    typeof result.aiAgents.conversation
                      ?.contextCompressionThreshold === "number"
                      ? result.aiAgents.conversation.contextCompressionThreshold
                      : 80,
                },
                insights: {
                  target: result.aiAgents.insights?.target || null,
                  temperature:
                    typeof result.aiAgents.insights?.temperature === "number"
                      ? result.aiAgents.insights.temperature
                      : 0.7,
                },
                autoHighlight: {
                  target: result.aiAgents.autoHighlight?.target || null,
                  temperature:
                    typeof result.aiAgents.autoHighlight?.temperature ===
                    "number"
                      ? result.aiAgents.autoHighlight.temperature
                      : 0.4,
                  maxHighlights:
                    typeof result.aiAgents.autoHighlight?.maxHighlights ===
                    "number"
                      ? result.aiAgents.autoHighlight.maxHighlights
                      : 15,
                  categoryStyles: {
                    conceptual: {
                      style:
                        result.aiAgents.autoHighlight?.categoryStyles
                          ?.conceptual?.style || HIGHLIGHT_STYLES.PAINT,
                      color:
                        result.aiAgents.autoHighlight?.categoryStyles
                          ?.conceptual?.color || DEFAULT_COLORS[0],
                    },
                    structural: {
                      style:
                        result.aiAgents.autoHighlight?.categoryStyles
                          ?.structural?.style || HIGHLIGHT_STYLES.UNDERLINE,
                      color:
                        result.aiAgents.autoHighlight?.categoryStyles
                          ?.structural?.color ||
                        DEFAULT_COLORS[3] ||
                        DEFAULT_COLORS[0],
                    },
                    behavioural: {
                      style:
                        result.aiAgents.autoHighlight?.categoryStyles
                          ?.behavioural?.style || HIGHLIGHT_STYLES.WAVY,
                      color:
                        result.aiAgents.autoHighlight?.categoryStyles
                          ?.behavioural?.color ||
                        DEFAULT_COLORS[1] ||
                        DEFAULT_COLORS[0],
                    },
                  },
                },
              }
            : settings.aiAgents,
        aiMcpServers: Array.isArray(result.aiMcpServers)
          ? result.aiMcpServers.map((s) => ({ ...s }))
          : [],
        aiLocalTools:
          result.aiLocalTools && typeof result.aiLocalTools === "object"
            ? {
                enabledToolNames: Array.isArray(
                  result.aiLocalTools.enabledToolNames,
                )
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
        aiSkills:
          result.aiSkills && typeof result.aiSkills === "object"
            ? {
                mode: result.aiSkills.mode === "auto" ? "auto" : "manual",
                autoSelectorTarget:
                  result.aiSkills.autoSelectorTarget &&
                  typeof result.aiSkills.autoSelectorTarget === "object"
                    ? result.aiSkills.autoSelectorTarget
                    : null,
              }
            : settings.aiSkills,
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
        sync:
          result.sync && typeof result.sync === "object"
            ? {
                enabled: Boolean(result.sync.enabled),
                s3:
                  result.sync.s3 && typeof result.sync.s3 === "object"
                    ? {
                        endpoint:
                          typeof result.sync.s3.endpoint === "string"
                            ? result.sync.s3.endpoint
                            : settings.sync.s3.endpoint,
                        region:
                          typeof result.sync.s3.region === "string"
                            ? result.sync.s3.region
                            : settings.sync.s3.region,
                        bucket:
                          typeof result.sync.s3.bucket === "string"
                            ? result.sync.s3.bucket
                            : settings.sync.s3.bucket,
                        accessKeyId:
                          typeof result.sync.s3.accessKeyId === "string"
                            ? result.sync.s3.accessKeyId
                            : settings.sync.s3.accessKeyId,
                        secretAccessKey:
                          typeof result.sync.s3.secretAccessKey === "string"
                            ? result.sync.s3.secretAccessKey
                            : settings.sync.s3.secretAccessKey,
                        sessionToken:
                          typeof result.sync.s3.sessionToken === "string"
                            ? result.sync.s3.sessionToken
                            : settings.sync.s3.sessionToken,
                        prefix:
                          typeof result.sync.s3.prefix === "string"
                            ? result.sync.s3.prefix
                            : settings.sync.s3.prefix,
                      }
                    : settings.sync.s3,
              }
            : settings.sync,
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
        if (Array.isArray(updated.aiProviders)) {
          settings.aiProviders = updated.aiProviders.map((p) => ({ ...p }));
        }
        if ("aiAgents" in updated && updated.aiAgents) {
          settings.aiAgents = updated.aiAgents;
        }
        if (Array.isArray(updated.aiMcpServers)) {
          settings.aiMcpServers = updated.aiMcpServers.map((s) => ({ ...s }));
        }
        if ("aiLocalTools" in updated && updated.aiLocalTools) {
          settings.aiLocalTools = updated.aiLocalTools;
        }
        if ("aiSkills" in updated && updated.aiSkills) {
          settings.aiSkills = updated.aiSkills;
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
