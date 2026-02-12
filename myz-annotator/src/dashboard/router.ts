import { createRouter, createWebHashHistory } from "vue-router"
import HighlightsPage from "./pages/HighlightsPage.jsx"
import SettingsLayout from "./pages/settings/SettingsLayout.jsx"
import SettingsImportPage from "./pages/settings/SettingsImportPage.jsx"
import SettingsSocialPage from "./pages/settings/SettingsSocialPage.jsx"
import SettingsSyncPage from "./pages/settings/SettingsSyncPage.jsx"
import HighlightPreferencesPage from "./pages/settings/highlight/HighlightPreferencesPage.jsx"
import SettingsAiLayout from "./pages/settings/ai/SettingsAiLayout.jsx"
import AiProvidersPage from "./pages/settings/ai/AiProvidersPage.jsx"
import AiAgentsPage from "./pages/settings/ai/AiAgentsPage.jsx"
import AiMcpPage from "./pages/settings/ai/AiMcpPage.jsx"
import AiLocalToolsPage from "./pages/settings/ai/AiLocalToolsPage.jsx"
import AiSkillsPage from "./pages/settings/ai/AiSkillsPage.jsx"
import AiVectorSearchPage from "./pages/settings/ai/AiVectorSearchPage.jsx"

const routes = [
  { path: "/", redirect: "/highlights" },
  { path: "/highlights", name: "highlights", component: HighlightsPage },
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
        path: "import",
        name: "settings-import",
        component: SettingsImportPage,
      },
      {
        path: "social",
        name: "settings-social",
        component: SettingsSocialPage,
      },
      {
        path: "sync",
        name: "settings-sync",
        component: SettingsSyncPage,
      },
      {
        path: "ai",
        component: SettingsAiLayout,
        children: [
          { path: "", redirect: "/settings/ai/providers" },
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
    ],
  },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})
