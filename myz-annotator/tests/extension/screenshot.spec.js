import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { createStaticServer } from "../helpers/static-server.js";
import { launchExtension } from "../helpers/launch-extension.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let server;
let serverUrl;
let context;
let page;
let extensionId;

test.beforeAll(async () => {
  const fixtures = path.join(__dirname, "..", "fixtures");
  const s = createStaticServer(fixtures);
  const listen = await s.listen(0);
  server = listen.server;
  serverUrl = listen.url;

  const extensionPath = path.join(__dirname, "..", "..", "dist");
  const launched = await launchExtension(extensionPath);
  context = launched.context;
  page = launched.page;
  extensionId = launched.extensionId;
});

test.afterAll(async () => {
  await context.close();
  await new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

test("capture_selection_creates_download", async () => {
  await page.goto(`${serverUrl}/myz-test.html`);

  // Make a real user selection by dragging across an element
  const para = await page.locator("p").first();
  const box = await para.boundingBox();
  if (!box) throw new Error("Could not determine paragraph bounding box");
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 10, box.y + 10);
  await page.mouse.up();

  // Wait for toolbar and ensure capture button is present
  await page.waitForSelector(".myz-annotator-toolbar:not(.myz-hidden)", {
    timeout: 5000,
  });
  await page.waitForSelector(
    '.myz-annotator-toolbar button[aria-label="截取选区截图"]',
    { timeout: 3000 },
  );

  // Click the capture button and wait for Playwright's download event
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 10000 }),
    page.click('.myz-annotator-toolbar button[aria-label="截取选区截图"]'),
  ]);

  // Ensure Playwright captured a download; suggestedFilename should be present
  const suggested = download.suggestedFilename();
  expect(suggested).toBeTruthy();

  // If the driver provides a file path, ensure it exists on disk
  const saved = await download.path();
  if (saved) {
    expect(fs.existsSync(saved)).toBeTruthy();
  }
});
