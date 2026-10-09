import { createRouter, createWebHashHistory } from "vue-router";
import HighlightsPage from "./pages/HighlightsPage.jsx";
import HighlightViewerPage from "./pages/HighlightViewerPage.jsx";
import InboxPage from "./pages/InboxPage.jsx";
import ReadersPage from "./pages/ReadersPage.jsx";
import HighlightPreferencesPage from "./pages/settings/highlight/HighlightPreferencesPage.jsx";
import SettingsAppearancePage from "./pages/settings/SettingsAppearancePage.jsx";
import SettingsImportPage from "./pages/settings/SettingsImportPage.jsx";
import SettingsInboxPage from "./pages/settings/SettingsInboxPage.jsx";
import SettingsLayout from "./pages/settings/SettingsLayout.jsx";
import SettingsSyncPage from "./pages/settings/SettingsSyncPage.jsx";
import SetupPage from "./pages/SetupPage.jsx";

const routes = [
  { path: "/", redirect: "/highlights" },
  { path: "/highlights", name: "highlights", component: HighlightsPage },
  { path: "/inbox", name: "inbox", component: InboxPage },
  {
    path: "/highlights/:id",
    name: "highlight-viewer",
    component: HighlightViewerPage,
  },
  { path: "/readers", name: "readers", component: ReadersPage },
  {
    path: "/setup",
    name: "setup",
    component: SetupPage,
    meta: { fullscreen: true },
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
        path: "inbox",
        name: "settings-inbox",
        component: SettingsInboxPage,
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
