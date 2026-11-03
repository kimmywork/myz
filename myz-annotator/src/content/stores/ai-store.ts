/**
 * AI hand-off preferences for the web capture toolbar.
 *
 * The toolbar only needs to know whether to show the 解读 button and which
 * provider name to put on it; the prompt template stays in the privileged
 * settings (the background renders it). Settings are read once per page load —
 * switching them on/off in the dashboard applies to pages loaded afterwards,
 * which avoids a message round-trip on every selection.
 */
import { defineStore } from "pinia";
import { ref } from "vue";
import { getAiProvider } from "@/ai/providers";
import { invoke } from "@/messaging/invoke";

export const useAiStore = defineStore("ai", () => {
  // Off until the background confirms the user opted in: the button is hidden by
  // default, which also covers a failed settings read.
  const enabled = ref(false);
  const providerLabel = ref(getAiProvider().label);
  const isLoaded = ref(false);

  async function load() {
    try {
      const settings = await invoke("myz:getPublicSettings");
      if (settings?.ai) {
        enabled.value = settings.ai.enabled === true;
        providerLabel.value =
          settings.ai.providerLabel ||
          getAiProvider(settings.ai.provider).label;
      }
    } catch (error) {
      console.warn("Failed to load AI preferences", error);
    } finally {
      isLoaded.value = true;
    }
  }

  // Content scripts mount per page load, so a single read is enough.
  void load();

  return { enabled, providerLabel, isLoaded, load };
});
