import { test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { setupDashboardHarness } from "../helpers/dashboard-harness.js";
import { dirnameFromImportMeta } from "../helpers/runtime.js";

const __dirname = dirnameFromImportMeta(import.meta.url);
const OUT_DIR = path.join(
  __dirname,
  "..",
  "screenshots",
  "out",
  "workspace-shell",
);

// 900 / 640 are the exact boundaries (>=900 inline nav, >=640 rail + drawer);
// 620 sits below 640 so the bottom bar is captured too.
const WIDTHS = [1440, 1280, 900, 640, 620] as const;
const ROUTES = ["/inbox", "/highlights"] as const;

const harness = setupDashboardHarness();

/**
 * Manual-acceptance helper: writes the four breakpoint screenshots to
 * `tests/screenshots/out/workspace-shell/` (git-ignored). Not a pixel
 * assertion — it only proves the shell renders at each width.
 */
test("capture_workspace_shell_widths", async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const route of ROUTES) {
    const dash = await harness.open(route);
    await dash.waitForSelector('[data-testid="workspace-shell"]');
    for (const width of WIDTHS) {
      await dash.setViewportSize({ width, height: 900 });
      await dash.waitForTimeout(150);
      await dash.screenshot({
        path: path.join(OUT_DIR, `i2-${route.slice(1)}-${width}.png`),
      });
    }
    await dash.close();
  }
});
