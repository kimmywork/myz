import { test, expect, BrowserContext, Page } from "@playwright/test";
import { Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchExtension } from "../helpers/launch-extension.js";
import { createStaticServer } from "../helpers/static-server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let context: BrowserContext;
let extensionId: string | null;
let server: Server;
let serverUrl: string;

test.beforeAll(async () => {
  const launched = await launchExtension(
    path.join(__dirname, "..", "..", "dist"),
  );
  context = launched.context;
  extensionId = launched.extensionId;
  const staticServer = createStaticServer(
    path.join(__dirname, "..", "fixtures"),
  );
  const listen = await staticServer.listen(0);
  server = listen.server;
  serverUrl = listen.url;
});

test.afterAll(async () => {
  await context?.close();
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

interface SpanRect {
  text: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

async function openMixed(): Promise<Page> {
  const page = await context.newPage();
  await page.goto(
    `chrome-extension://${extensionId}/src/pdf/pdf-viewer.html?url=${encodeURIComponent(`${serverUrl}/myz-pdf-mixed.pdf`)}`,
  );
  await page.waitForFunction(() => Boolean((window as any).__MYZ_PDF__));
  await page.waitForFunction(
    () => (window as any).__MYZ_PDF__?.getState().status === "ready",
    undefined,
    { timeout: 15000 },
  );
  await page.waitForTimeout(600);
  return page;
}

async function pageSpans(page: Page): Promise<SpanRect[]> {
  return page.evaluate(() => {
    const pageEl = document.querySelector('.pdf-page[data-page="1"]')!;
    return (
      Array.from(pageEl.querySelectorAll(".textLayer span")) as HTMLElement[]
    ).map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        text: el.textContent ?? "",
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      };
    });
  });
}

function findSpan(spans: SpanRect[], needle: string): SpanRect {
  const span = spans.find((entry) => entry.text.includes(needle));
  if (!span) throw new Error(`span not found: ${needle}`);
  return span;
}

function selection(page: Page): Promise<string> {
  return page.evaluate(() => window.getSelection()?.toString() ?? "");
}

test("pdf_triple_click_selects_whole_paragraph", async () => {
  const page = await openMixed();
  const spans = await pageSpans(page);
  const line = findSpan(spans, "The quick brown fox");
  await page.mouse.click(
    (line.left + line.right) / 2,
    (line.top + line.bottom) / 2,
    { clickCount: 3 },
  );

  const text = await selection(page);
  expect(text).toContain("The quick brown fox");
  // The paragraph wraps to a second line, which must be included.
  expect(text).toContain("watches from the shadows");
  // The next paragraph must not be included.
  expect(text).not.toContain("Modern interfaces");
  await page.close();
});

test("pdf_drag_overshoot_stops_at_paragraph_end", async () => {
  const page = await openMixed();
  const spans = await pageSpans(page);
  const firstLine = findSpan(spans, "The quick brown fox");
  const lastLine = findSpan(spans, "watches from the shadows");
  const nextParagraph = findSpan(spans, "Modern interfaces");

  // Drag past the paragraph's last line but into the gap above the next one.
  const startY = (firstLine.top + firstLine.bottom) / 2;
  const endY = (lastLine.bottom + nextParagraph.top) / 2;
  await page.mouse.move(firstLine.left + 5, startY);
  await page.mouse.down();
  await page.mouse.move(firstLine.right + 30, endY, { steps: 10 });
  await page.mouse.up();

  const text = await selection(page);
  expect(text).toContain("The quick brown fox");
  expect(text).toContain("watches from the shadows");
  expect(text).not.toContain("Modern interfaces");
  await page.close();
});

test("pdf_drag_inside_a_line_selects_partial_text", async () => {
  const page = await openMixed();
  const spans = await pageSpans(page);
  const line = findSpan(spans, "Modern interfaces");
  const y = (line.top + line.bottom) / 2;
  await page.mouse.move(line.left + (line.right - line.left) * 0.5, y);
  await page.mouse.down();
  await page.mouse.move(line.right + 20, y, { steps: 8 });
  await page.mouse.up();

  const text = await selection(page);
  expect(text.length).toBeGreaterThan(0);
  expect(text).not.toContain("The quick brown fox");
  // The selection is a suffix of this line.
  expect(line.text.endsWith(text.trim())).toBe(true);
  await page.close();
});

test("pdf_triple_click_then_highlight_saves_whole_paragraph", async () => {
  const page = await openMixed();
  const spans = await pageSpans(page);
  const line = findSpan(spans, "The quick brown fox");
  await page.mouse.click(
    (line.left + line.right) / 2,
    (line.top + line.bottom) / 2,
    { clickCount: 3 },
  );

  await page.locator('.selection-toolbar button[title="划线"]').click();
  const record = await page.evaluate(
    () => (window as any).__MYZ_PDF__.getAnnotations()[0],
  );
  expect(record.text).toContain("The quick brown fox");
  expect(record.text).toContain("watches from the shadows");
  expect(record.pdfLocator.rects.length).toBeGreaterThanOrEqual(2);
  await page.close();
});
