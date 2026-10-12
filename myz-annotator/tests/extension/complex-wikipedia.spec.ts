import { test, expect, BrowserContext, Page } from "@playwright/test";
import path from "node:path";
import { launchExtension } from "../helpers/launch-extension.js";
import { dirnameFromImportMeta } from "../helpers/runtime.js";

const __dirname = dirnameFromImportMeta(import.meta.url);

let context: BrowserContext;
let page: Page;

test.beforeAll(async () => {
  const extensionPath = path.join(__dirname, "..", "..", "dist");
  const launched = await launchExtension(extensionPath);
  context = launched.context;
  page = launched.page;
});

test.afterAll(async () => {
  try {
    await context?.close();
  } catch (e) {}
});

test.skip("highlight_on_wikipedia_awk_page", async () => {
  // Visit AWK page on Wikipedia (live site)
  await page.goto("https://en.wikipedia.org/wiki/AWK", {
    waitUntil: "load",
    timeout: 60000,
  });

  // Choose a couple of paragraphs to highlight (intro and first section paragraph)
  // Use CSS selector to locate informative paragraphs inside #mw-content-text
  const introPara = await page
    .locator("#mw-content-text .mw-parser-output > p")
    .first();
  await introPara.waitFor({ timeout: 10000 });
  const introBox = await introPara.boundingBox();
  if (!introBox) throw new Error("Could not find intro paragraph bounding box");

  // Make a selection across the intro paragraph
  await page.mouse.move(introBox.x + 10, introBox.y + 10);
  await page.mouse.down();
  await page.mouse.move(
    introBox.x + Math.min(400, introBox.width - 10),
    introBox.y + 30,
  );
  await page.mouse.up();

  // capture selected text
  const selIntro = await page.evaluate(() => {
    const s = window.getSelection();
    return s ? s.toString().trim() : "";
  });

  // Wait for toolbar and click 添加标注
  await page.waitForSelector(".myz-annotator-toolbar:not(.myz-hidden)", {
    timeout: 8000,
  });
  await page.click('.myz-annotator-toolbar button[aria-label="添加标注"]');
  await page.waitForSelector(".myz-annotator-modal:not(.myz-hidden)", {
    timeout: 8000,
  });
  await page.click(".myz-annotator-modal .myz-btn-primary");

  // Ensure highlight appears
  await page.waitForSelector(".myz-highlight", { timeout: 10000 });
  const highlights = await page.$$(".myz-highlight");
  expect(highlights.length).toBeGreaterThan(0);

  // Collect highlight texts and perform token-based match like other complex tests
  const highlightTexts = await Promise.all(
    highlights.map((h) =>
      h.evaluate((el) => (el as HTMLElement).innerText || el.textContent || ""),
    ),
  );
  const normalize = (s: string) => (s || "").replace(/\s+/g, " ").trim();
  const combined = highlightTexts.map(normalize).join(" ");
  const tokens = normalize(selIntro)
    .split(/[\s，,、。]+/)
    .filter(Boolean)
    .slice(0, 6);
  // Ensure at least one meaningful token is present in highlights
  const foundToken = tokens.some(
    (tok) => tok.length > 1 && combined.includes(tok),
  );
  expect(foundToken).toBeTruthy();
});
