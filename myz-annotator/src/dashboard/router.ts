import { createRouter, createWebHashHistory } from "vue-router";
import AssetsPage from "./pages/AssetsPage.jsx";
import HighlightsPage from "./pages/HighlightsPage.jsx";
import HighlightViewerPage from "./pages/HighlightViewerPage.jsx";
import InboxPage from "./pages/InboxPage.jsx";
import ReaderHostPage from "./pages/ReaderHostPage.jsx";
import ReadersPage from "./pages/ReadersPage.jsx";
import SetupPage from "./pages/SetupPage.jsx";
import StitchHostPage from "./pages/StitchHostPage.jsx";

const routes = [
  { path: "/", redirect: "/highlights" },
  {
    path: "/highlights",
    name: "highlights",
    component: HighlightsPage,
    meta: { workspace: true },
  },
  {
    path: "/inbox",
    name: "inbox",
    component: InboxPage,
    meta: { workspace: true },
  },
  {
    path: "/highlights/:id",
    name: "highlight-viewer",
    component: HighlightViewerPage,
    meta: { workspace: true },
  },
  {
    path: "/readers",
    name: "readers",
    component: ReadersPage,
    meta: { workspace: true },
  },
  // Embedded reader host: `/read?kind=pdf|epub&src=<viewer query string>`.
  {
    path: "/read",
    name: "reader-host",
    component: ReaderHostPage,
    meta: { workspace: true },
  },
  {
    // Embedded stitch editor host (2026-11-23): 拼图 on the rail.
    path: "/stitch",
    name: "stitch-host",
    component: StitchHostPage,
    meta: { workspace: true },
  },
  {
    path: "/assets",
    name: "assets",
    component: AssetsPage,
    meta: { workspace: true },
  },
  {
    path: "/setup",
    name: "setup",
    component: SetupPage,
    meta: { fullscreen: true },
  },
  {
    // Settings is a modal (§4.17), not a page. These paths are deep links:
    // SettingsModalHost watches the route and opens the modal at the matching
    // section. The library renders beneath it so the workspace is still what
    // a reload (and the rail) comes back to.
    path: "/settings/:pathMatch(.*)*",
    component: HighlightsPage,
    meta: { workspace: true },
  },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});
