import { test, expect, BrowserContext, Page } from "@playwright/test";
import { Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchExtension } from "../helpers/launch-extension.js";
import { createStaticServer } from "../helpers/static-server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

async function selectAndAnnotateRange(page: Page, selector: string) {
  // Select a portion of the element by dragging the mouse from startRatio to endRatio
  const el = page.locator(selector).first();
  await el.waitFor({ timeout: 5000 });
  const box = await el.boundingBox();
  if (!box) throw new Error(`Could not determine box for ${selector}`);
  const startX = box.x + 6;
  const startY = box.y + 6;
  const endX = box.x + Math.max(10, box.width - 6);
  const endY = box.y + Math.max(10, box.height - 6);

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY);
  await page.mouse.up();
  // brief pause to allow selection change listeners to run
  await page.waitForTimeout(120);

  // Wait for toolbar and click annotate
  await page.waitForSelector(".myz-annotator-toolbar:not(.myz-hidden)", {
    timeout: 10000,
  });
  await page.click('.myz-annotator-toolbar button[aria-label="添加标注"]');
  await page.waitForSelector(".myz-annotator-modal:not(.myz-hidden)", {
    timeout: 5000,
  });
  await page.click(".myz-annotator-modal .myz-btn-primary");
  // allow time for DOM update
  await page.waitForTimeout(300);
}

test("prevent overlapping highlights and notify user", async () => {
  await page.goto(`${serverUrl}/myz-test.html`);

  // Ensure clean start
  await page.evaluate(() => {
    document.querySelectorAll(".myz-highlight").forEach((n) => n.remove());
  });

  // Create first highlight over a slice of para-1 (characters 10..60)
  await selectAndAnnotateRange(page, "#para-1");
  await page.waitForSelector(".myz-highlight", { timeout: 5000 });

  // Attempt to create an overlapping highlight: start inside the first
  // applied highlight and drag further right so it overlaps.
  // Locate the first highlight and drag starting from its center to the right.
  const firstHl = (await page.$$(".myz-highlight"))[0];
  if (!firstHl) throw new Error("First highlight missing");
  const box = await firstHl.boundingBox();
  if (!box) throw new Error("Could not get bounding box of first highlight");
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  // drag to a point further right in the paragraph
  const para = await page.locator("#para-1").first();
  const paraBox = (await para.boundingBox())!;
  const endX = paraBox.x + Math.max(10, paraBox.width - 6);
  const endY = startY;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY);
  await page.mouse.up();
  // small pause to allow selection handlers
  await page.waitForTimeout(120);
  // open annotate modal
  await page.waitForSelector(".myz-annotator-toolbar:not(.myz-hidden)", {
    timeout: 5000,
  });
  await page.click('.myz-annotator-toolbar button[aria-label="添加标注"]');

  // Expect a notification toast to appear indicating failure
  const toast = await page
    .waitForSelector(".myz-toast", { timeout: 10000 })
    .catch(() => null);
  expect(await toast?.textContent()).toBeTruthy();
});
