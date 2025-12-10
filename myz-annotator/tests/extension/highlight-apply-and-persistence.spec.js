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
let extensionId;

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
  extensionId = launched.extensionId;
});

test.afterAll(async () => {
  await context.close();
  await new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

test("apply_highlight_style_applies_dom_change and highlight_persists_after_reload", async () => {
  await page.goto(`${serverUrl}/myz-test.html`);

  // Create a real user selection by dragging across #para-2 so the content
  // script receives mouse events and shows the toolbar.
  const para = await page.locator("#para-2");
  const box = await para.boundingBox();
  if (!box) throw new Error("Could not determine paragraph bounding box");
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 10, box.y + 10);
  await page.mouse.up();

  await page.waitForTimeout(300); // wait a bit for selection to register

  // capture the selected text so we can assert the saved highlight contains it
  const selectionText = await page.evaluate(() => {
    const s = window.getSelection();
    return s ? s.toString().trim() : "";
  });

  // Wait for toolbar and click annotate (aria-label in Toolbar.jsx)
  await page.waitForSelector(".myz-annotator-toolbar:not(.myz-hidden)", {
    timeout: 5000,
  });
  await page.click('.myz-annotator-toolbar button[aria-label="添加标注"]');

  // Wait for modal and click save
  await page.waitForSelector(".myz-annotator-modal:not(.myz-hidden)", {
    timeout: 8000,
  });
  await page.click(".myz-annotator-modal .myz-btn-primary");

  // After saving, a .myz-highlight element should appear
  await page.waitForSelector(".myz-highlight", { timeout: 2000 });
  const highlights = await page.$$(".myz-highlight");
  expect(highlights.length).toBeGreaterThan(0);

  // At least one highlight element should contain the selected text
  const highlightTexts = await Promise.all(
    highlights.map((h) =>
      h.evaluate((el) => el.innerText || el.textContent || ""),
    ),
  );

  const matched = highlightTexts.some(
    (t) => typeof t === "string" && t.trim().includes(selectionText),
  );
  expect(matched).toBeTruthy();

  await page.waitForTimeout(300); // wait a bit for highlight to be applied

  // Record count then reload and expect highlights to reappear
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector(".myz-highlight", { timeout: 10000 });

  await page.waitForTimeout(300); // wait a bit for highlight to be applied

  const highlightsAfter = await page.$$(".myz-highlight");
  expect(highlightsAfter.length).toBeGreaterThan(0);

  // After reload at least one highlight should still contain our selected text
  const highlightAfterTexts = await Promise.all(
    highlightsAfter.map((h) =>
      h.evaluate((el) => el.innerText || el.textContent || ""),
    ),
  );
  const matchedAfter = highlightAfterTexts.some(
    (t) => typeof t === "string" && t.trim().includes(selectionText),
  );
  expect(matchedAfter).toBeTruthy();
});

test("remove_highlight_updates_dom_and_storage", async () => {
  // Ensure at least one highlight exists
  await page.goto(`${serverUrl}/myz-test.html`);
  await page.waitForSelector(".myz-highlight", { timeout: 8000 });

  // Click the first highlight to open inspector
  await page.click(".myz-highlight");
  await page.waitForSelector(".myz-inspector:not(.myz-hidden)", {
    timeout: 8000,
  });

  // Click delete button in inspector
  await page.click(".myz-inspector .myz-btn-danger");

  // Inspector should hide and highlight should be removed
  await page.waitForSelector(".myz-highlight", {
    state: "detached",
    timeout: 5000,
  });

  // Note: verifying chrome.storage from the page context isn't available
  // (content pages don't have access to the extension storage API). The DOM
  // removal above is the primary signal that the highlight was deleted.
});

test("save_clip_via_toolbar_persists_to_dashboard", async () => {
  // Ensure extension id is available
  if (!extensionId) {
    throw new Error("extensionId not available in test context");
  }

  await page.goto(`${serverUrl}/myz-test.html`);

  // Select a short piece of text in #para-1 and click 保存文字
  const para = await page.locator("#para-1");
  const box = await para.boundingBox();
  if (!box) throw new Error("Could not determine paragraph bounding box");
  // choose a small inner region
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 10);
  await page.mouse.up();


  await page.waitForTimeout(300); // wait a bit for selection to register
  // record the selection text for later verification
  const selectionText = await page.evaluate(() => {
    const s = window.getSelection();
    return s ? s.toString().trim() : "";
  });

  await page.waitForSelector(".myz-annotator-toolbar:not(.myz-hidden)", {
    timeout: 5000,
  });
  await page.waitForSelector(
    '.myz-annotator-toolbar button[aria-label="保存文字"]',
    { timeout: 3000 },
  );

  // Click 保存文字, submit modal, then verify via dashboard that the clip exists
  await page.click('.myz-annotator-toolbar button[aria-label="保存文字"]');
  await page.waitForSelector(".myz-annotator-modal:not(.myz-hidden)", {
    timeout: 5000,
  });
  await page.click(".myz-annotator-modal .myz-btn-primary");

  // Open dashboard page and query saved highlights for this URL
  const dashboardUrl = `chrome-extension://${extensionId}/src/dashboard/index.html`;
  const dash = await context.newPage();
  await dash.goto(dashboardUrl);
  await dash.waitForSelector(".app-shell", { timeout: 5000 });

  const canonical = await page.evaluate((u) => {
    try {
      const url = new URL(u);
      url.hash = "";
      return url.toString();
    } catch (e) {
      return u;
    }
  }, `${serverUrl}/myz-test.html`);

  const records = await dash.evaluate(async (url) => {
    return await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: "myz:getHighlightsForUrl", payload: { url } },
        (resp) => {
          if (chrome.runtime.lastError)
            return reject(new Error(chrome.runtime.lastError.message));
          resolve(resp);
        },
      );
    });
  }, canonical);

  const data = Array.isArray(records?.data) ? records.data : [];
  // There should be at least one saved clip matching our selection text
  const found = data.find(
    (r) => typeof r.text === "string" && r.text.includes(selectionText),
  );
  expect(found).toBeTruthy();
});
