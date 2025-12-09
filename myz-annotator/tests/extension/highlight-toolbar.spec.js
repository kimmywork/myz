import path from "node:path";
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
