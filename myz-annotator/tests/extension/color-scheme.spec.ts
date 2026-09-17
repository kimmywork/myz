import { test, expect, BrowserContext, Page } from "@playwright/test";
import { Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LaunchedExtension,
  launchExtension,
} from "../helpers/launch-extension.js";
import { createStaticServer } from "../helpers/static-server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let server: Server;
let context: BrowserContext;
let page: Page;
let extensionId: string | null;
let launched: LaunchedExtension;

test.beforeAll(async () => {
  const fixtures = path.join(__dirname, "..", "fixtures");
  const s = createStaticServer(fixtures);
  const listen = await s.listen(0);
  server = listen.server;

  const extensionPath = path.join(__dirname, "..", "..", "dist");
  launched = await launchExtension(extensionPath);
  context = launched.context;
  page = launched.page;
  extensionId = launched.extensionId;
  if (!extensionId) {
    throw new Error("Could not determine extension id (extensionId is null).");
  }
});

test.afterAll(async () => {
  await context.close();
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

test("dashboard_scheme_switch_persists_and_reaches_popup", async () => {
  const dashboardUrl = `chrome-extension://${extensionId}/src/dashboard/index.html#/settings/appearance`;
  const dash = await context.newPage();
  await dash.goto(dashboardUrl);
  await dash.waitForSelector("[role='radiogroup'][aria-label='配色方案']", {
    timeout: 5000,
  });

  expect(await dash.evaluate(() => document.documentElement.dataset.scheme)).toBe(
    "paper",
  );

  await dash.locator("button[role='radio']", { hasText: "赭石" }).click();
  await dash.waitForFunction(
    () => document.documentElement.dataset.scheme === "ochre",
    undefined,
    { timeout: 5000 },
  );

  await dash.reload();
  await dash.waitForSelector("[role='radiogroup'][aria-label='配色方案']", {
    timeout: 5000,
  });
  await dash.waitForFunction(
    () => document.documentElement.dataset.scheme === "ochre",
    undefined,
    { timeout: 5000 },
  );

  await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
  const popup = context.pages().find((p) => p.url().includes("popup.html"));
  expect(popup).toBeTruthy();
  const target = popup ?? page;
  await target.waitForSelector(".popup-header", { timeout: 5000 });
  await target.waitForFunction(
    () => document.documentElement.dataset.scheme === "ochre",
    undefined,
    { timeout: 5000 },
  );

  await dash.close();
});

test("subtree_scheme_scope_drives_token_utilities", async () => {
  const dashboardUrl = `chrome-extension://${extensionId}/src/dashboard/index.html#/highlights`;
  const dash = await context.newPage();
  await dash.goto(dashboardUrl);
  await dash.waitForSelector(".app-shell", { timeout: 5000 });

  const probe = await dash.evaluate(() => {
    const el = document.createElement("div");
    el.className = "bg-surface text-muted";
    el.dataset.theme = "light";
    el.dataset.scheme = "paper";
    document.body.appendChild(el);
    const first = getComputedStyle(el);
    const paper = { bg: first.backgroundColor, color: first.color };
    el.dataset.scheme = "ochre";
    const second = getComputedStyle(el);
    const ochre = { bg: second.backgroundColor, color: second.color };
    el.remove();
    return { paper, ochre };
  });

  expect(probe.paper.bg).toBe("rgb(250, 249, 245)");
  expect(probe.ochre.bg).toBe("rgb(251, 246, 238)");
  expect(probe.paper.bg).not.toBe(probe.ochre.bg);
  expect(probe.paper.color).not.toBe(probe.ochre.color);

  await dash.close();
});
