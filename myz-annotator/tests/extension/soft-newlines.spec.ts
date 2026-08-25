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
let extensionId: string | null;

test.beforeAll(async () => {
  const fixtures = path.join(__dirname, "..", "fixtures");
  const s = createStaticServer(fixtures);
  const listen = await s.listen(0);
  server = listen.server;
  serverUrl = listen.url;

  // Requires `npm run build` so myz-annotator/dist exists.
  const extensionPath = path.join(__dirname, "..", "..", "dist");
  const launched = await launchExtension(extensionPath);
  context = launched.context;
  page = launched.page;
  extensionId = launched.extensionId;
});

test.afterAll(async () => {
  await context?.close();
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

// Regression for: multi-line pasted text captured from a white-space:pre-wrap
// container was collapsed into a single line in IndexedDB. The browser shows
// real line breaks; serializeRangeToHtml must now turn those soft newlines
// into <br> so the downstream HTML→markdown keeps them.
test("soft_newlines_preserved_for_pre_wrap_selection", async () => {
  if (!extensionId) {
    throw new Error("extensionId not available in test context");
  }

  await page.goto(`${serverUrl}/soft-newlines.html`);

  // Select the whole pre-wrap block by dragging across it like a user. Start
  // a few px in from the top-left and end a few px inside the bottom-right so
  // the selection covers the block text but stays within its bounds.
  const block = await page.locator("#pre-wrap-block");
  const box = await block.boundingBox();
  if (!box) throw new Error("Could not determine pre-wrap block bounding box");

  await page.mouse.move(box.x + 4, box.y + 6);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 6, box.y + box.height - 6, {
    steps: 20,
  });
  await page.mouse.up();
  await page.waitForTimeout(300);

  // Sanity: the live selection spans multiple lines (pre-wrap rendered them).
  const selectionText = await page.evaluate(() => {
    const s = window.getSelection();
    return s ? s.toString() : "";
  });
  expect(selectionText.length).toBeGreaterThan(50);
  expect(selectionText).toContain("Scaling, but not only of parameters");

  // Save as a clip via the toolbar.
  await page.waitForSelector(".myz-annotator-toolbar:not(.myz-hidden)", {
    timeout: 5000,
  });
  await page.waitForSelector(
    '.myz-annotator-toolbar button[aria-label="保存文字"]',
    { timeout: 3000 },
  );
  await page.click('.myz-annotator-toolbar button[aria-label="保存文字"]');
  await page.waitForSelector(".myz-annotator-modal:not(.myz-hidden)", {
    timeout: 5000,
  });
  await page.click(".myz-annotator-modal .myz-btn-primary");

  // Read the saved record back via the extension dashboard context.
  const canonical = await page.evaluate((u) => {
    try {
      const url = new URL(u);
      url.hash = "";
      return url.toString();
    } catch {
      return u;
    }
  }, `${serverUrl}/soft-newlines.html`);

  const dashboardUrl = `chrome-extension://${extensionId}/src/dashboard/index.html`;
  const dash = await context.newPage();
  await dash.goto(dashboardUrl);
  await dash.waitForSelector(".app-shell", { timeout: 8000 });

  const records = await dash.evaluate<{ data?: any[] }>(async (url) => {
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
  expect(data.length).toBeGreaterThan(0);

  const record = data[data.length - 1];
  // The headline must survive.
  expect(record.text).toContain("Thoughts About Scaling Law");
  expect(typeof record.text).toBe("string");
  const lines = (record.text as string).split("\n");
  // CRITICAL: soft newlines must be preserved as line breaks in the stored
  // markdown text, not collapsed to a single line. The fixture has four
  // paragraphs, so the stored text must span many lines (defuddle emits a
  // trailing hard-break line per <br>, inflating the count further).
  expect(lines.length).toBeGreaterThan(4);
  // Each paragraph must land on its own line — verify the second paragraph
  // starts a new line rather than being glued onto the headline.
  expect(record.text).toMatch(/\nScaling, but not only of parameters/);

  await dash.close();
});
