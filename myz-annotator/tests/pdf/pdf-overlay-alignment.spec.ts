import { test, expect, BrowserContext, Page } from "@playwright/test";
import { Server } from "node:http";
import path from "node:path";
import { launchExtension } from "../helpers/launch-extension.js";
import { dirnameFromImportMeta } from "../helpers/runtime.js";
import { createStaticServer } from "../helpers/static-server.js";

const __dirname = dirnameFromImportMeta(import.meta.url);

// CI headless Chromium renders the PDF text layer with different font metrics
// than a local desktop, so the overlay baseline drifts a few pixels. Keep the
// desktop assertion tight and relax only under CI.
const ALIGN_SLACK = process.env.CI ? 8 : 2;
const SIZE_SLACK = process.env.CI ? 6 : 3;

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
  if (!extensionId) throw new Error("no extension id");
  const fixtures = path.join(__dirname, "..", "fixtures");
  const staticServer = createStaticServer(fixtures);
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

async function openReader(url: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForFunction(() => Boolean((window as any).__MYZ_PDF__));
  await page.waitForFunction(
    () => (window as any).__MYZ_PDF__?.getState().status === "ready",
  );
  return page;
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const pageEl = document.querySelector(
      '.pdf-page[data-page="1"]',
    ) as HTMLElement;
    const layer = pageEl.querySelector(".textLayer") as HTMLElement;
    const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let text = "";
    let node = walker.nextNode();
    while (node) {
      nodes.push(node as Text);
      text += (node as Text).data;
      node = walker.nextNode();
    }
    const target = "Page One Alpha";
    const index = text.indexOf(target);
    let acc = 0;
    let startNode: Text | null = null;
    let endNode: Text | null = null;
    let startOffset = 0;
    let endOffset = 0;
    for (const current of nodes) {
      const len = current.data.length;
      if (!startNode && index <= acc + len) {
        startNode = current;
        startOffset = index - acc;
      }
      if (!endNode && index + target.length <= acc + len) {
        endNode = current;
        endOffset = index + target.length - acc;
        break;
      }
      acc += len;
    }
    const range = document.createRange();
    range.setStart(startNode as Text, startOffset);
    range.setEnd(endNode as Text, endOffset);
    const textRect = range.getBoundingClientRect();
    const overlay = document.querySelector(".pdf-annotation") as HTMLElement;
    const overlayRect = overlay.getBoundingClientRect();
    return {
      dx: overlayRect.x - textRect.x,
      dy: overlayRect.y - textRect.y,
      dw: overlayRect.width - textRect.width,
      dh: overlayRect.height - textRect.height,
    };
  });
}

test("pdf_overlay_aligns_with_text_before_and_after_reload", async () => {
  const pdfUrl = `${serverUrl}/myz-pdf-reader.pdf`;
  const page = await openReader(
    `chrome-extension://${extensionId}/src/pdf/pdf-viewer.html?url=${encodeURIComponent(pdfUrl)}`,
  );
  await page.evaluate(() =>
    (window as any).__MYZ_PDF__.selectText("Page One Alpha", 1),
  );
  // Let the PDF text layer settle its fonts/layout before the annotation is
  // positioned; otherwise the overlay can be a few px off under CI headless.
  await page.evaluate(() => (document as any).fonts?.ready);
  await page.evaluate(() =>
    (window as any).__MYZ_PDF__.createAnnotation("highlight"),
  );
  const created = await measure(page);
  console.log("ALIGN_CREATED", JSON.stringify(created));
  expect(Math.abs(created.dx)).toBeLessThan(ALIGN_SLACK);
  expect(Math.abs(created.dy)).toBeLessThan(ALIGN_SLACK);
  expect(Math.abs(created.dw)).toBeLessThan(SIZE_SLACK);
  expect(Math.abs(created.dh)).toBeLessThan(SIZE_SLACK);

  await page.reload();
  await page.waitForFunction(() => Boolean((window as any).__MYZ_PDF__));
  await page.waitForFunction(
    () => (window as any).__MYZ_PDF__?.getState().status === "ready",
  );
  await page.evaluate(() => (document as any).fonts?.ready);
  const restored = await measure(page);
  console.log("ALIGN_RESTORED", JSON.stringify(restored));
  expect(Math.abs(restored.dx)).toBeLessThan(ALIGN_SLACK);
  expect(Math.abs(restored.dy)).toBeLessThan(ALIGN_SLACK);
  await page.close();
});
