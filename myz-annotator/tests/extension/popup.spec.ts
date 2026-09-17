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

  // Ensure extension built to dist/
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

test("popup_shows_saved_highlights_and_copy", async () => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  // Open the content page so popup has an active tab
  await page.goto(`${serverUrl}/myz-test.html`);

  // Open the popup page directly in a tab (extension pages have access to
  // chrome.runtime APIs when opened this way). This is simpler and more
  // reliable for inspecting popup DOM in tests.
  const popupUrl = `chrome-extension://${extensionId}/src/popup/popup.html`;
  const popup = await context.newPage();
  await popup.goto(popupUrl);
  // Ensure popup initialized (may show empty state)
  await popup.waitForSelector(".popup-header", { timeout: 5000 });

  // Create a saved clip via runtime message from the popup context.
  const canonical = await page.evaluate((url) => {
    try {
      const u = new URL(url);
      u.hash = "";
      return u.toString();
    } catch {
      return url;
    }
  }, `${serverUrl}/myz-test.html`);

  const payload = {
    url: canonical,
    sourceUrl: canonical,
    title: "Test Page",
    text: "clipboard test snippet",
    html: "<p>clipboard test snippet</p>",
    note: "note",
    tags: ["阅读", "排版"],
    hostname: new URL(canonical).hostname,
    kind: "clip",
  };

  // Save via chrome.runtime.sendMessage in popup context
  const saved = await popup.evaluate<{ ok: boolean }>(async (p) => {
    return await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: "myz:saveHighlight", payload: p },
        (resp) => {
          if (chrome.runtime.lastError)
            return reject(new Error(chrome.runtime.lastError.message));
          resolve(resp);
        },
      );
    });
  }, payload);

  expect(saved && saved.ok).toBeTruthy();

  // Bring the content tab to front so the popup's activeTab is the fixture page
  await page.bringToFront();

  // Reload popup so it fetches highlights for the active tab
  await popup.reload();
  await popup.waitForSelector(".highlight-item", { timeout: 5000 });

  // Tags render as chips per the design system (§4.5).
  const tagChips = await popup.$$eval(
    ".highlight-item__tags > span",
    (els) => els.map((el) => (el.textContent || "").trim()),
  );
  expect(tagChips).toEqual(["阅读", "排版"]);

  // Click the copy button on first highlight and verify clipboard
  const copyBtn = await popup.$(
    '.highlight-item .highlight-item__actions [data-action="copy"]',
  );
  expect(copyBtn).toBeTruthy();
  await copyBtn?.click();

  // Read clipboard from popup context
  const clipboardText = await popup.evaluate(async () => {
    try {
      return await navigator.clipboard.readText();
    } catch (e) {
      return null;
    }
  });

  expect(clipboardText).toContain("clipboard test snippet");
});
