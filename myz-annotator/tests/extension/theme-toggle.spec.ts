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
let serverUrl: string;
let context: BrowserContext;
let page: Page;
let extensionId: string | null;
let launched: LaunchedExtension;

test.beforeAll(async () => {
  const fixtures = path.join(__dirname, "..", "fixtures");
  const s = createStaticServer(fixtures);
  const listen = await s.listen(0);
  server = listen.server;
  serverUrl = listen.url;

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

async function getPopupThemeButton() {
  const popupUrl = `chrome-extension://${extensionId}/src/popup/popup.html`;
  const popup = await context.newPage();
  await popup.goto(popupUrl);
  await popup.waitForSelector(".popup-header", { timeout: 5000 });
  const button = await popup.$("button[aria-haspopup='listbox']");
  return { popup, button };
}

async function getDashboardThemeButton() {
  const dashboardUrl = `chrome-extension://${extensionId}/src/dashboard/index.html`;
  const dash = await context.newPage();
  await dash.goto(dashboardUrl);
  await dash.waitForSelector(".app-shell", { timeout: 5000 });
  const button = await dash.$("button[aria-haspopup='listbox']");
  return { dash, button };
}

test("popup_theme_toggle_reflects_effective_theme", async () => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`${serverUrl}/myz-test.html`);

  const { popup, button } = await getPopupThemeButton();
  expect(button).toBeTruthy();

  const label = await popup.$eval(
    "button[aria-haspopup='listbox']",
    (el) => el.textContent?.trim() || "",
  );
  expect(["亮色", "暗色", "跟随系统"]).toContain(label);
});

test("dashboard_theme_dropdown_changes_theme", async () => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`${serverUrl}/myz-test.html`);

  const { dash, button } = await getDashboardThemeButton();
  expect(button).toBeTruthy();

  await button?.click();
  const menu = await dash.$("[role='listbox']");
  expect(menu).toBeTruthy();

  const darkOption = await dash.$("[role='option']:has-text('暗色')");
  expect(darkOption).toBeTruthy();
  await darkOption?.click();

  await dash.waitForTimeout(300);
  const updatedLabel = await dash.$eval(
    "button[aria-haspopup='listbox']",
    (el) => el.textContent?.trim() || "",
  );
  expect(updatedLabel).toContain("暗色");
});
