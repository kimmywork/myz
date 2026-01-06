import { defineStore } from "pinia";
import { reactive, ref } from "vue";
import { Settings } from "@/background/settings.js";
import { sendMessage } from "@/shared/messaging.js";
import { DEFAULT_COLOR, DEFAULT_HIGHLIGHT_STYLE } from "@/shared/types.js";

export const useSettingsStore = defineStore("settings", () => {
  const settings: Settings = reactive({
    dashboardView: "cards",
    aiAssistantEnabled: false,
    aiProviders: [],
    aiAgents: {
      conversation: { target: null, temperature: 0.7 },
      insights: { target: null, temperature: 0.7 },
    },
    aiMcpServers: [],
    vectorSearchEnabled: false,
    vectorModelReady: false,
    vectorUseLocalModel: true,
    vectorOpenAiEndpoint: "",
    vectorOpenAiApiKey: "",
    vectorOpenAiModel: "text-embedding-3-small",
    vectorMaxChars: 500,
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
  const vectorModelLoading = ref(false);
  const vectorModelStatus = ref("");
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
        vectorSearchEnabled: Boolean(result.vectorSearchEnabled),
        vectorModelReady: result.vectorSearchEnabled
          ? Boolean(result.vectorModelReady)
          : false,
        vectorUseLocalModel:
          result.vectorUseLocalModel !== false &&
          result.vectorUseLocalModel !== "remote",
        vectorOpenAiEndpoint: result.vectorOpenAiEndpoint || "",
        vectorOpenAiApiKey: result.vectorOpenAiApiKey || "",
        vectorOpenAiModel:
          result.vectorOpenAiModel || settings.vectorOpenAiModel,
        vectorMaxChars:
          typeof result.vectorMaxChars === "number" && result.vectorMaxChars > 0
            ? Math.floor(result.vectorMaxChars)
            : settings.vectorMaxChars,
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
        if (Array.isArray(updated.aiProviders)) {
          settings.aiProviders = updated.aiProviders.map((p) => ({ ...p }));
        }
        if ("aiAgents" in updated && updated.aiAgents) {
          settings.aiAgents = updated.aiAgents as any;
        }
        if (Array.isArray(updated.aiMcpServers)) {
          settings.aiMcpServers = updated.aiMcpServers.map((s) => ({ ...s }));
        }
        if ("vectorSearchEnabled" in updated) {
          settings.vectorSearchEnabled = Boolean(updated.vectorSearchEnabled);
        }
        if ("vectorModelReady" in updated) {
          settings.vectorModelReady = Boolean(updated.vectorModelReady);
        }
        if ("vectorUseLocalModel" in updated) {
          settings.vectorUseLocalModel =
            updated.vectorUseLocalModel !== false &&
            updated.vectorUseLocalModel !== "remote";
        }
        if ("vectorOpenAiEndpoint" in updated) {
          settings.vectorOpenAiEndpoint = updated.vectorOpenAiEndpoint || "";
        }
        if ("vectorOpenAiApiKey" in updated) {
          settings.vectorOpenAiApiKey = updated.vectorOpenAiApiKey || "";
        }
        if ("vectorOpenAiModel" in updated) {
          settings.vectorOpenAiModel =
            updated.vectorOpenAiModel || settings.vectorOpenAiModel;
        }
        if ("vectorMaxChars" in updated) {
          settings.vectorMaxChars =
            typeof updated.vectorMaxChars === "number" &&
            updated.vectorMaxChars > 0
              ? Math.floor(updated.vectorMaxChars)
              : settings.vectorMaxChars;
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

  async function toggleVectorSearch(enabled: boolean) {
    settings.vectorSearchEnabled = enabled;
    if (!enabled) {
      settings.vectorModelReady = false;
    }
    const payload = {
      vectorSearchEnabled: enabled,
      vectorModelReady: enabled ? settings.vectorModelReady : false,
    };
    try {
      setTimedStatus(settingsStatus, "保存中…", 0);
      const updated = await sendMessage<Partial<Settings>, Partial<Settings>>(
        "myz:updateSettings",
        payload,
      );
      if (updated) {
        settings.vectorSearchEnabled = Boolean(updated.vectorSearchEnabled);
        settings.vectorModelReady = Boolean(updated.vectorModelReady);
      }
      setTimedStatus(settingsStatus, "设置已保存", 2000);
    } catch (error) {
      settings.vectorSearchEnabled = !enabled;
      setTimedStatus(
        settingsStatus,
        `更新失败：${(error as Error).message}`,
        4000,
      );
      throw error;
    }
  }

  async function loadVectorModel() {
    if (!settings.vectorSearchEnabled) {
      setTimedStatus(vectorModelStatus, "请先启用向量检索", 3000);
      return { success: false };
    }
    vectorModelLoading.value = true;
    try {
      setTimedStatus(vectorModelStatus, "加载模型中…", 0);
      const result = await sendMessage("myz:loadVectorModel");
      if (result?.vectorModelReady) {
        settings.vectorModelReady = true;
        setTimedStatus(vectorModelStatus, "模型加载完成", 4000);
      } else {
        setTimedStatus(vectorModelStatus, "模型未完成加载", 3000);
      }
      return result;
    } catch (error) {
      settings.vectorModelReady = false;
      setTimedStatus(
        vectorModelStatus,
        `加载失败：${(error as Error).message}`,
        4000,
      );
      throw error;
    } finally {
      vectorModelLoading.value = false;
    }
  }

  async function testVectorProvider(config: Partial<Settings>) {
    try {
      setTimedStatus(vectorModelStatus, "测试中…", 0);
      const result = await sendMessage("myz:testVectorProvider", config);
      if (result?.success) {
        setTimedStatus(vectorModelStatus, "测试通过", 3000);
      } else {
        setTimedStatus(vectorModelStatus, "测试失败", 3000);
      }
      return result;
    } catch (error) {
      setTimedStatus(
        vectorModelStatus,
        `测试失败：${(error as Error).message}`,
        4000,
      );
      throw error;
    }
  }

  async function rebuildVectorIndex() {
    try {
      setTimedStatus(vectorModelStatus, "重建索引中…", 0);
      await sendMessage("myz:rebuildVectorIndex");
      setTimedStatus(vectorModelStatus, "索引已重建", 4000);
    } catch (error) {
      setTimedStatus(
        vectorModelStatus,
        `重建失败：${(error as Error).message}`,
        4000,
      );
      throw error;
    }
  }

  async function switchVectorProvider(payload: Partial<Settings>) {
    await saveSettings(payload);
    if (payload.vectorUseLocalModel) {
      if (settings.vectorSearchEnabled) {
        await loadVectorModel().catch(() => {});
      }
    } else if (payload.vectorOpenAiApiKey) {
      await testVectorProvider(payload);
      await saveSettings({ ...payload, vectorModelReady: true });
      setTimedStatus(settingsStatus, "已切换到 OpenAI 模型", 3000);
    }
  }

  function cleanup() {
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
  }

  return {
    settings,
    settingsStatus,
    vectorModelLoading,
    vectorModelStatus,
    initialize,
    loadSettings,
    saveSettings,
    toggleVectorSearch,
    loadVectorModel,
    testVectorProvider,
    rebuildVectorIndex,
    switchVectorProvider,
    cleanup,
  };
});
