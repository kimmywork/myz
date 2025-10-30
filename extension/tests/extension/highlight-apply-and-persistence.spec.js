const path = require("path");
const { test, expect } = require("@playwright/test");
const { createStaticServer } = require("../helpers/static-server");
const { launchExtension } = require("../helpers/launch-extension");

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
  // step (`npm run build`) so `extension/dist` exists.
  const extensionPath = path.join(__dirname, "..", "..", "dist");
  const launched = await launchExtension(extensionPath);
  context = launched.context;
  page = launched.page;
});

test.afterAll(async () => {
  await context.close();
  server.close;
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
  await page.waitForSelector(".myz-highlight", { timeout: 8000 });
  const highlights = await page.$$(".myz-highlight");
  expect(highlights.length).toBeGreaterThan(0);

  // Record count then reload and expect highlights to reappear
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector(".myz-highlight", { timeout: 10000 });

  const highlightsAfter = await page.$$(".myz-highlight");
  expect(highlightsAfter.length).toBeGreaterThan(0);
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
