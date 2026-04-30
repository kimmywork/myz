import { createRouter, createWebHistory } from "vue-router";
import AppShell from "../dashboard/components/AppShell";
import ChatPage from "../dashboard/pages/ChatPage";
import HighlightsPage from "../dashboard/pages/HighlightsPage";
import HighlightPreferencesPage from "../dashboard/pages/settings/highlight/HighlightPreferencesPage";
import AiAgentsPage from "../dashboard/pages/settings/ai/AiAgentsPage";
import AiLocalToolsPage from "../dashboard/pages/settings/ai/AiLocalToolsPage";
import AiMcpPage from "../dashboard/pages/settings/ai/AiMcpPage";
import AiProvidersPage from "../dashboard/pages/settings/ai/AiProvidersPage";
import AiSkillsPage from "../dashboard/pages/settings/ai/AiSkillsPage";
import AiVectorSearchPage from "../dashboard/pages/settings/ai/AiVectorSearchPage";
import SettingsAiLayout from "../dashboard/pages/settings/ai/SettingsAiLayout";
import SettingsImportPage from "../dashboard/pages/settings/SettingsImportPage";
import SettingsLayout from "../dashboard/pages/settings/SettingsLayout";
import SettingsSocialPage from "../dashboard/pages/settings/SettingsSocialPage";
import SettingsSyncPage from "../dashboard/pages/settings/SettingsSyncPage";
import { desktopDashboardHost } from "../host/desktop";

const settingsChildren = [
  {
    path: "",
    redirect: "/settings/highlight/preferences",
  },
  {
    path: "highlight/preferences",
    name: "settings-highlight-preferences",
    component: HighlightPreferencesPage,
  },
  {
    path: "import",
    name: "settings-import",
    component: SettingsImportPage,
  },
  ...(desktopDashboardHost.features.socialImport
    ? [
        {
          path: "social",
          name: "settings-social",
          component: SettingsSocialPage,
        },
      ]
    : [
        {
          path: "social",
          redirect: "/settings/import",
        },
      ]),
  {
    path: "sync",
    name: "settings-sync",
    component: SettingsSyncPage,
  },
  {
    path: "ai",
    component: SettingsAiLayout,
    children: [
      {
        path: "",
        redirect: "/settings/ai/providers",
      },
      {
        path: "providers",
        name: "settings-ai-providers",
        component: AiProvidersPage,
      },
      {
        path: "agents",
        name: "settings-ai-agents",
        component: AiAgentsPage,
      },
      {
        path: "mcp",
        name: "settings-ai-mcp",
        component: AiMcpPage,
      },
      {
        path: "tools",
        name: "settings-ai-tools",
        component: AiLocalToolsPage,
      },
      {
        path: "skills",
        name: "settings-ai-skills",
        component: AiSkillsPage,
      },
      {
        path: "vector",
        name: "settings-ai-vector",
        component: AiVectorSearchPage,
      },
    ],
  },
];

const routes = [
  {
    path: "/",
    component: AppShell,
    children: [
      {
        path: "",
        redirect: "/highlights",
      },
      {
        path: "highlights",
        component: HighlightsPage,
      },
      {
        path: "chat",
        component: ChatPage,
      },
      {
        path: "settings",
        component: SettingsLayout,
        children: settingsChildren,
      },
    ],
  },
  {
    path: "/:pathMatch(.*)*",
    redirect: "/highlights",
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
