import { createRouter, createWebHashHistory } from "vue-router";
import HighlightsPage from "./pages/HighlightsPage.jsx";
import HighlightViewerPage from "./pages/HighlightViewerPage.jsx";
import HighlightPreferencesPage from "./pages/settings/highlight/HighlightPreferencesPage.jsx";
import SettingsAppearancePage from "./pages/settings/SettingsAppearancePage.jsx";
import SettingsImportPage from "./pages/settings/SettingsImportPage.jsx";
import SettingsLayout from "./pages/settings/SettingsLayout.jsx";
import SettingsSyncPage from "./pages/settings/SettingsSyncPage.jsx";

const routes = [
  { path: "/", redirect: "/highlights" },
  { path: "/highlights", name: "highlights", component: HighlightsPage },
  {
    path: "/highlights/:id",
    name: "highlight-viewer",
    component: HighlightViewerPage,
  },
  {
    path: "/settings",
    component: SettingsLayout,
    children: [
      { path: "", redirect: "/settings/highlight/preferences" },
      {
        path: "highlight/preferences",
        name: "settings-highlight-preferences",
        component: HighlightPreferencesPage,
      },
      {
        path: "appearance",
        name: "settings-appearance",
        component: SettingsAppearancePage,
      },
      {
        path: "import",
        name: "settings-import",
        component: SettingsImportPage,
      },
      {
        path: "sync",
        name: "settings-sync",
        component: SettingsSyncPage,
      },
    ],
  },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});
