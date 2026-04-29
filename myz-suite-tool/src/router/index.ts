import {
  DASHBOARD_HOST_CAPABILITY_PRESETS,
  type DashboardHostKind,
} from "@myz/dashboard-core/host";
import { createNotesWorkspaceRoutes } from "@myz/notes-workspace";
import { createRouter, createWebHistory } from "vue-router";
import { createDesktopDashboardHost } from "../host/desktop";

const hostKind: DashboardHostKind = "desktop";
const host = createDesktopDashboardHost();

const routes = [
  ...createNotesWorkspaceRoutes({
    appName: "@myz-suite/desktop",
    hostKind,
    capabilities: DASHBOARD_HOST_CAPABILITY_PRESETS[hostKind],
    host,
  }),
  {
    path: "/:pathMatch(.*)*",
    redirect: "/",
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
