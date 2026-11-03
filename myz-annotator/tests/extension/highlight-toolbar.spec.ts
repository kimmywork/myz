import { test, expect, BrowserContext, Page } from "@playwright/test";
import { Server } from "node:http";
import path from "node:path";
import { openTabProbe, setAiSettings } from "../helpers/ai-chat-harness.js";
import { launchExtension } from "../helpers/launch-extension.js";
import { dirnameFromImportMeta } from "../helpers/runtime.js";
import { createStaticServer } from "../helpers/static-server.js";

const __dirname = dirnameFromImportMeta(import.meta.url);

let server: Server;
let serverUrl: string;
let context: BrowserContext;
let page: Page;

test.beforeAll(async () => {
  const fixtures = path.join(__dirname, "..", "fixtures");
  const s = createStaticServer(fixtures);
  const listen = await s.listen(0);
  server = listen.server;
  serverUrl = listen.url;

  // Load the built extension output. Ensure you've run the extension build
  // step (`npm run build`) so `myz-annotator/dist` exists.
  const extensionPath = path.join(__dirname, "..", "..", "dist");
  const launched = await launchExtension(extensionPath);
  context = launched.context;
  page = launched.page;
});

test.afterAll(async () => {
  try {
    await context?.close();
  } catch (e) {}
  try {
    server && server.close();
  } catch (e) {}
});

test("highlight_toolbar_shows_on_selection", async () => {
  await page.goto(`${serverUrl}/myz-test.html`);

  // Simulate a real user selection by dragging the mouse across the paragraph
  const para = await page.locator("#para-1");
  const box = await para.boundingBox();
  if (!box) throw new Error("Could not determine paragraph bounding box");
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 10, box.y + 10);
  await page.mouse.up();

  // Wait for toolbar to be visible (not having myz-hidden)
  await page.waitForSelector(".myz-annotator-toolbar:not(.myz-hidden)", {
    timeout: 8000,
  });
  const toolbarVisible = await page.$eval(
    ".myz-annotator-toolbar",
    (el) => !el.classList.contains("myz-hidden"),
  );
  expect(toolbarVisible).toBeTruthy();
});

test("content_toolbar_translates_between_capture_and_search", async () => {
  await page.goto(`${serverUrl}/myz-test.html`);

  const para = await page.locator("#para-1");
  const box = await para.boundingBox();
  if (!box) throw new Error("Could not determine paragraph bounding box");
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 10, box.y + 10);
  await page.mouse.up();

  await page.waitForSelector(".myz-annotator-toolbar:not(.myz-hidden)", {
    timeout: 8000,
  });

  // The AI hand-off is opt-in (off by default), so the capture toolbar ships
  // with five actions; the sixth appears only after it is enabled in settings.
  const labels = await page.$$eval(".myz-annotator-toolbar button", (buttons) =>
    buttons.map((button) => button.getAttribute("aria-label")),
  );
  expect(labels).toEqual(["划线", "摘录", "截取", "翻译", "搜索"]);

  const probe = await openTabProbe(context);
  await setAiSettings(probe, { enabled: true });
  await probe.close();
  await page.reload();

  const reloadedBox = await page.locator("#para-1").boundingBox();
  if (!reloadedBox)
    throw new Error("Could not find the paragraph after reload");
  await page.mouse.move(reloadedBox.x + 10, reloadedBox.y + 10);
  await page.mouse.down();
  await page.mouse.move(
    reloadedBox.x + reloadedBox.width - 10,
    reloadedBox.y + 10,
  );
  await page.mouse.up();
  await page.waitForSelector(".myz-annotator-toolbar:not(.myz-hidden)", {
    timeout: 8000,
  });
  // The AI store reads settings asynchronously, so wait for the extra button.
  await expect(page.locator(".myz-annotator-toolbar button")).toHaveCount(6, {
    timeout: 8000,
  });
  const enabledLabels = await page.$$eval(
    ".myz-annotator-toolbar button",
    (buttons) => buttons.map((button) => button.getAttribute("aria-label")),
  );
  expect(enabledLabels).toEqual([
    "划线",
    "摘录",
    "截取",
    "翻译",
    "使用 DeepSeek 解读",
    "搜索",
  ]);

  await page.locator('button[aria-label="翻译"]').click();
  const popover = page.locator(".translation-popover");
  await expect(popover).toBeVisible();
  await expect(popover.locator(".translation-popover__title")).toContainText(
    "翻译",
  );
  await expect(popover.locator(".translation-popover__source")).toContainText(
    "is a simple paragraph",
  );

  await popover.locator(".translation-popover__close").click();
  await expect(page.locator(".translation-popover")).toHaveCount(0);
});
