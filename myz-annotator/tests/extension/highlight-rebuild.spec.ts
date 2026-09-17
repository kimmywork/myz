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
});

test.afterAll(async () => {
  await context.close();
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

test("highlight_is_rebuilt_from_text_when_the_stored_path_goes_stale", async () => {
  const url = `${serverUrl}/rebuild-fixture.html`;
  await page.goto(url);
  await page.waitForTimeout(400);

  const para = page.locator("#para-1");
  const box = await para.boundingBox();
  if (!box) throw new Error("no paragraph box");
  await page.mouse.move(box.x + 8, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + Math.min(box.width - 8, 180), box.y + 8);
  await page.mouse.up();
  await page.waitForSelector(".myz-annotator-toolbar:not(.myz-hidden)", {
    timeout: 8000,
  });
  await page.click('.myz-annotator-toolbar button[aria-label="划线"]');
  await page.waitForSelector(".myz-annotator-modal:not(.myz-hidden)", {
    timeout: 8000,
  });
  await page.click(".myz-annotator-modal .myz-btn-primary");
  await page.waitForTimeout(500);

  const before = await page.$$eval(".myz-highlight", (nodes) =>
    nodes.map((n) => (n.textContent || "").trim()),
  );
  expect(before.length).toBeGreaterThan(0);

  // Reload with a structural change: an extra <article> is inserted, so the
  // stored path index for the original article no longer resolves.
  await page.goto(`${url}#mutate`);
  await page.reload();
  await page.waitForSelector("article#extra", { timeout: 5000 });

  await page.waitForSelector(".myz-highlight", { timeout: 10000 });
  const after = await page.$$eval(".myz-highlight", (nodes) =>
    nodes.map((n) => (n.textContent || "").trim()),
  );
  expect(after.join(" ")).toContain(before[0].slice(0, 30));

  // The user is told the position was rebuilt.
  await page.waitForSelector(".myz-toast", { timeout: 5000 });
  const toast = await page.$eval(".myz-toast", (el) => el.textContent || "");
  expect(toast).toContain("重建");
});

const OLD_TEXT =
  "This log replication mechanism exhibits the desirable consensus properties described in Section 2: Raft can accept, replicate, and apply new log entries as long as a majority of the servers are up.";

test("highlight_is_rebuilt_by_anchor_when_the_page_text_was_edited", async () => {
  const url = `${serverUrl}/rebuild-edited-fixture.html`;
  const hostname = new URL(url).hostname;

  // Seed a record whose stored text is a slightly older revision of the page
  // (the page says "a majority of servers"), and whose range cannot resolve.
  const popup = await context.newPage();
  await popup.goto(
    `chrome-extension://${launched.extensionId}/src/popup/popup.html`,
  );
  const saved = await popup.evaluate(
    async (record) =>
      await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: "myz:saveHighlight", payload: record },
          (response) => resolve(response),
        );
      }),
    {
      kind: "highlight",
      text: OLD_TEXT,
      url,
      sourceUrl: url,
      title: "Rebuild (edited text) fixture",
      hostname,
      sourceType: "web",
      contentType: "text/plain",
      color: "#b58900",
      style: "paint",
      range: {
        start: {
          path: [
            { name: "html", index: 0 },
            { name: "body", index: 0 },
            { name: "div", index: 99 },
          ],
          charOffset: 0,
        },
        end: {
          path: [
            { name: "html", index: 0 },
            { name: "body", index: 0 },
            { name: "div", index: 99 },
          ],
          charOffset: 0,
        },
      },
    },
  );
  expect((saved as { ok?: boolean } | null)?.ok).toBeTruthy();
  await popup.close();

  await page.goto(url);
  await page.waitForSelector(".myz-highlight", { timeout: 10000 });

  const restored = await page.$$eval(".myz-highlight", (nodes) =>
    nodes.map((n) => (n.textContent || "").trim()),
  );
  expect(restored.join(" ")).toContain(
    "log replication mechanism exhibits the desirable consensus",
  );

  await page.waitForSelector(".myz-toast", { timeout: 5000 });
  const toast = await page.$eval(".myz-toast", (el) => el.textContent || "");
  expect(toast).toContain("重建");
});
