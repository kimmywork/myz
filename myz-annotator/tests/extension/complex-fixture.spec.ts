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

async function clearAllHighlights() {
  if (!context || !extensionId) {
    return;
  }
  const dashboardUrl = `chrome-extension://${extensionId}/src/dashboard/index.html`;
  const extPage = await context.newPage();
  try {
    await extPage.goto(dashboardUrl);
    await extPage.waitForSelector(".app-shell", { timeout: 5000 });
    await extPage.evaluate(async () => {
      function sendMessage(type: string, payload?: any) {
        return new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ type, payload }, (resp) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (!resp || !resp.ok) {
              reject(new Error(resp?.error || "unknown error"));
              return;
            }
            resolve(resp.data);
          });
        });
      }

      const highlights = await sendMessage("myz:getAllHighlights");
      for (const record of Array.isArray(highlights) ? highlights : []) {
        if (!record?.id) continue;
        try {
          await sendMessage("myz:removeHighlight", { id: record.id });
        } catch (error) {
          console.warn("Failed to remove highlight", record.id, error);
        }
      }
    });
  } finally {
    await extPage.close();
  }
}

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

test.beforeEach(async () => {
  await clearAllHighlights();
});

test.afterAll(async () => {
  try {
    await context?.close();
  } catch (e) {}
  try {
    server && server.close();
  } catch (e) {}
});

async function selectAndAnnotate(
  page: Page,
  locator: string,
  note = "",
  text: string | undefined = undefined,
) {
  const el = text
    ? page.locator(locator, { hasText: text }).first()
    : page.locator(locator).first();
  await el.waitFor({ timeout: 5000 });
  await el.scrollIntoViewIfNeeded({ timeout: 5000 });
  const box = await el.boundingBox();
  if (!box) throw new Error(`Could not determine box for ${locator}`);
  // Drag across the element
  await page.mouse.move(box.x + 6, box.y + 6);
  await page.mouse.down();
  await page.mouse.move(
    box.x + Math.max(10, box.width - 6),
    box.y + Math.max(10, box.height - 6),
  );
  await page.mouse.up();
  await page.waitForTimeout(300); // wait a bit for selection to register
  // capture selected text so caller can assert highlight content
  const selected = await page.evaluate(() => {
    const s = window.getSelection();
    return s ? s.toString().trim() : "";
  });

  // Wait for toolbar
  await page.waitForSelector(".myz-annotator-toolbar:not(.myz-hidden)", {
    timeout: 5000,
  });
  await page.click('.myz-annotator-toolbar button[aria-label="划线"]');

  // Wait for modal, optionally fill note, then save
  await page.waitForSelector(".myz-annotator-modal:not(.myz-hidden)", {
    timeout: 5000,
  });
  if (note) {
    // textarea inside modal
    await page.fill(".myz-annotator-modal textarea", note);
  }
  await page.click(".myz-annotator-modal .myz-btn-primary");
  // Wait for highlight to appear (extended timeout for slower CI environments)
  await page.waitForSelector(".myz-highlight", { timeout: 15000 });
  return selected;
}

test("highlight_and_comment_on_complex_fixture", async () => {
  await page.goto(`${serverUrl}/complex-highlight-test.html`);

  // 1) Paragraph with repeated text
  const sel1 = await selectAndAnnotate(page, "p", "note para", "高亮测试");

  // 2) Table cell text
  const sel2 = await selectAndAnnotate(page, "td", "note table", "高亮测试");

  // 3) Code block content (select inside pre/code)
  const sel3 = await selectAndAnnotate(page, ".code-block pre", "note code");

  // 4) Details collapsed content: open then select inside
  await page.click("details summary");
  const sel4 = await selectAndAnnotate(
    page,
    "details p",
    "note details",
    "这个段落藏在详情里",
  );

  // 5) Repeat line (one of the repeated lines)
  const sel5 = await selectAndAnnotate(
    page,
    ".repeat .line",
    "note repeat",
    "第 3 行",
  );

  // After creating several highlights, reload to verify persistence
  await page.reload({ waitUntil: "load" });
  // Wait for highlights to reapply
  await page.waitForSelector(".myz-highlight", { timeout: 10000 });
  const highlights = await page.$$(".myz-highlight");
  expect(highlights.length).toBeGreaterThanOrEqual(5);

  // Verify at least one highlight contains each of the selected texts (normalize whitespace)
  const highlightTexts = await Promise.all(
    highlights.map((h) =>
      h.evaluate((el) => (el as HTMLElement).innerText || el.textContent || ""),
    ),
  );
  const normalize = (s: string) => (s || "").replace(/\s+/g, " ").trim();
  const normalizedHighlights = highlightTexts.map((t) => normalize(t));
  const combined = normalizedHighlights.join(" ");
  [sel1, sel2, sel3, sel4, sel5].forEach((sel) => {
    const ns = normalize(sel);
    if (!ns) return; // skip empty selections
    // Be tolerant: split the selection into meaningful tokens and ensure each
    // appears somewhere in the combined highlighted text. This handles cases
    // where the selection is split across multiple highlight elements.
    const tokens = ns.split(/[\s，,、。]+/).filter(Boolean);
    tokens.forEach((tok) => {
      if (tok.length < 2) return; // skip very short tokens
      const present = combined.includes(tok);
      if (!present) {
        const dbg = normalizedHighlights.join(" | ");
        throw new Error(
          `Token not found in highlights: "${tok}" (from selection: "${ns}"); highlights: ${dbg}`,
        );
      }
    });
  });

  // Click the first highlight to open inspector and then click 编辑 to open edit modal
  await page.click(".myz-highlight");
  await page.waitForSelector(".myz-inspector:not(.myz-hidden)", {
    timeout: 5000,
  });
  // click 编辑 (edit icon button in inspector)
  await page.click(".myz-inspector .myz-inspector__icon-btn--edit");
  // modal should open in edit mode
  await page.waitForSelector(".myz-annotator-modal:not(.myz-hidden)", {
    timeout: 5000,
  });
  // add a suffix note and save
  await page.fill(".myz-annotator-modal textarea", "edited by test");
  await page.click(".myz-annotator-modal .myz-btn-primary");
  // modal remains in DOM but becomes hidden; wait for it to be hidden
  await page.waitForSelector(".myz-annotator-modal", {
    state: "hidden",
    timeout: 10000,
  });

  // Ensure inspector updates when re-opening the highlight
  await page.click(".myz-highlight");
  await page.waitForSelector(".myz-inspector:not(.myz-hidden)", {
    timeout: 5000,
  });
  const noteText = await page.$eval(
    ".myz-inspector__note",
    (el) => el.textContent || "",
  );
  expect(noteText).toContain("edited by test");
});

test("export_markdown_contains_codeblock_and_notes", async () => {
  await page.goto(`${serverUrl}/complex-highlight-test.html`);

  // highlight code block and add a note
  await selectAndAnnotate(page, ".code-block pre", "export note code");

  // highlight a paragraph and add a note
  await selectAndAnnotate(page, "p", "export note para", "高亮测试");

  // Ensure highlights applied (extended timeout for slower CI environments)
  await page.waitForSelector(".myz-highlight", { timeout: 15000 });
  const highlightCount = await page.$$eval(
    ".myz-highlight",
    (els) => els.length,
  );
  expect(highlightCount).toBeGreaterThanOrEqual(2);

  // Trigger export via extension dashboard context (content pages don't have chrome.runtime)
  const dashboardUrl = `chrome-extension://${extensionId}/src/dashboard/index.html`;
  const extPage = await context.newPage();
  await extPage.goto(dashboardUrl);
  await extPage.waitForSelector(".app-shell", { timeout: 5000 });
  const exportResult = await extPage.evaluate<{
    ok: boolean;
    data?: { markdown?: string };
  }>(async () => {
    return await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "myz:export" }, (resp) => {
        if (chrome.runtime.lastError)
          return reject(new Error(chrome.runtime.lastError.message));
        resolve(resp);
      });
    });
  });

  expect(exportResult && exportResult.ok).toBeTruthy();
  const markdown = exportResult?.data?.markdown || "";
  // exported markdown should include a reference to the highlighted code (function name)
  // export may use blockquote-style formatting, so be permissive and look for the function call
  expect(markdown).toMatch(/highlight\(/);
  // should include our notes
  expect(markdown).toContain("export note code");
  expect(markdown).toContain("export note para");
});
