import { createRouter, createWebHistory } from "vue-router";
import Layout from "../components/Layout";
import Home from "../views/Home";
import HomeOverview from "../views/home/HomeOverview";
import HomeTools from "../views/home/HomeTools";
import HomeActivity from "../views/home/HomeActivity";
import Monitor from "../views/Monitor";
import MonitorMCP from "../views/monitor/MonitorMCP";
import MonitorModels from "../views/monitor/MonitorModels";
import MonitorAgents from "../views/monitor/MonitorAgents";
import Settings from "../views/Settings";
import GeneralSettings from "../views/settings/GeneralSettings";
import EnvironmentSettings from "../views/settings/EnvironmentSettings";
import NetworkSettings from "../views/settings/NetworkSettings";
import MCPSettings from "../views/settings/MCPSettings";
import ModelSettings from "../views/settings/ModelSettings";
import AgentSettings from "../views/settings/AgentSettings";
import MonitorUnimplemented from "../views/monitor/MonitorUnimplemented";

const routes = [
  {
    path: "/",
    component: Layout,
    children: [
      {
        path: "",
        name: "Home",
        component: Home,
        children: [
          {
            path: "",
            name: "HomeOverview",
            component: HomeOverview,
          },
          {
            path: "tools",
            name: "HomeTools",
            component: HomeTools,
          },
          {
            path: "activity",
            name: "HomeActivity",
            component: HomeActivity,
          },
        ],
      },
      {
        path: "/monitor",
        name: "Monitor",
        component: Monitor,
        children: [
          {
            path: "",
            name: "MonitorMCP",
            component: MonitorMCP,
          },
          {
            path: "models",
            name: "MonitorModels",
            component: MonitorModels,
          },
          {
            path: "agents",
            name: "MonitorAgents",
            component: MonitorAgents,
          },
          {
            path: "network",
            name: "MonitorNetwork",            
            component: MonitorUnimplemented,

          },
          {
            path: "system",
            name: "MonitorSystem",
            component: MonitorUnimplemented,
          },
        ],
      },
      {
        path: "/settings",
        name: "Settings",
        component: Settings,
        children: [
          {
            path: "",
            name: "GeneralSettings",
            component: GeneralSettings,
          },
          {
            path: "environment",
            name: "EnvironmentSettings",
            component: EnvironmentSettings,
          },
          {
            path: "network",
            name: "NetworkSettings",
            component: NetworkSettings,
          },
          {
            path: "mcp",
            name: "MCPSettings",
            component: MCPSettings,
          },
          {
            path: "models",
            name: "ModelSettings",
            component: ModelSettings,
          },
          {
            path: "agents",
            name: "AgentSettings",
            component: AgentSettings,
          },
        ],
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
