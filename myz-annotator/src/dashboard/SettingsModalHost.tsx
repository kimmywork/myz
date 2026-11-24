import { Dialog } from "@myz/dashboard-ui";
import { computed, defineComponent, h, watch } from "vue";
import type { Component } from "vue";
import { useRoute, useRouter } from "vue-router";
import HighlightPreferencesPage from "./pages/settings/highlight/HighlightPreferencesPage.jsx";
import type { SettingsSectionKey } from "./pages/settings/settings-sections.js";
import { settingsSectionForPath } from "./pages/settings/settings-sections.js";
import SettingsAiPage from "./pages/settings/SettingsAiPage.jsx";
import SettingsAppearancePage from "./pages/settings/SettingsAppearancePage.jsx";
import SettingsImportPage from "./pages/settings/SettingsImportPage.jsx";
import SettingsInboxPage from "./pages/settings/SettingsInboxPage.jsx";
import SettingsSidebar from "./pages/settings/SettingsSidebar.jsx";
import SettingsSyncPage from "./pages/settings/SettingsSyncPage.jsx";
import { useSettingsStore } from "./stores/settings.js";
import { useUIStore } from "./stores/ui.js";

const SECTION_COMPONENTS: Record<SettingsSectionKey, Component> = {
  "highlight-preferences": HighlightPreferencesPage,
  appearance: SettingsAppearancePage,
  sync: SettingsSyncPage,
  inbox: SettingsInboxPage,
  ai: SettingsAiPage,
  import: SettingsImportPage,
};

/**
 * Settings surface (§4.17 as a modal): a large dialog with the group nav on
 * the left and the section on the right. Opened from the rail footer button —
 * the workspace page stays mounted underneath; closing returns to it.
 *
 * Legacy `#/settings/...` deep links drive the same modal through the route
 * (the library renders beneath it, so a reload comes back to the same view).
 */
export default defineComponent({
  name: "SettingsModalHost",
  setup() {
    const uiStore = useUIStore();
    const settingsStore = useSettingsStore();
    const route = useRoute();
    const router = useRouter();
    const section = computed(() => SECTION_COMPONENTS[uiStore.settingsSection]);

    // Deep links: the settings path decides the section. A route change to a
    // workspace page never closes the modal by itself — only the close
    // affordances do (§4.8).
    watch(
      () => route.path,
      (path) => {
        if (!path.startsWith("/settings")) return;
        uiStore.openSettings(settingsSectionForPath(path));
      },
      { immediate: true },
    );

    function close() {
      uiStore.closeSettings();
      // Deep-link entry keeps the settings path while open; normalize it away
      // so the URL is back on the workspace after closing.
      if (route.path.startsWith("/settings")) {
        void router.replace("/highlights");
      }
    }

    return () => (
      <Dialog
        open={uiStore.settingsOpen}
        title="设置"
        width={880}
        height={640}
        onClose={close}
      >
        {/* Fixed frame (§4.17): swapping sections must not resize the modal.
            The group nav and the section detail are two blocks that scroll
            relative to the modal independently — a long section (AI 解读)
            scrolls without dragging the nav along. */}
        <div class="flex h-full min-h-0 flex-col gap-4 overflow-y-auto min-[900px]:flex-row min-[900px]:overflow-hidden">
          <div
            class="w-full min-[900px]:w-52 min-[900px]:shrink-0 min-[900px]:overflow-y-auto min-[900px]:border-r min-[900px]:border-line min-[900px]:pr-4"
            data-testid="settings-nav-pane"
          >
            <SettingsSidebar
              active={uiStore.settingsSection}
              onSelect={(key: SettingsSectionKey) => {
                uiStore.settingsSection = key;
              }}
            />
          </div>
          <div
            class="min-w-0 flex-1 min-[900px]:overflow-y-auto"
            data-testid="settings-detail-pane"
          >
            {settingsStore.settingsStatus ? (
              <p
                class="mb-2 text-caption text-muted"
                role="status"
                aria-live="polite"
              >
                {settingsStore.settingsStatus}
              </p>
            ) : null}
            {h(section.value)}
          </div>
        </div>
      </Dialog>
    );
  },
});
