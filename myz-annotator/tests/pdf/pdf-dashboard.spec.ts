import { test, expect, BrowserContext, Page } from "@playwright/test";
import { Server } from "node:http";
import path from "node:path";
import { launchExtension } from "../helpers/launch-extension.js";
import { dirnameFromImportMeta } from "../helpers/runtime.js";
import { createStaticServer } from "../helpers/static-server.js";

const __dirname = dirnameFromImportMeta(import.meta.url);
const SHOT_DIR = process.env.PDF_SHOT_DIR || "/tmp";

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

async function createPdfAnnotation(pdfUrl: string): Promise<void> {
  const reader = await context.newPage();
  await reader.goto(
    `chrome-extension://${extensionId}/src/pdf/pdf-viewer.html?url=${encodeURIComponent(pdfUrl)}`,
  );
  await reader.waitForFunction(() => Boolean((window as any).__MYZ_PDF__));
  await reader.waitForFunction(
    () => (window as any).__MYZ_PDF__?.getState().status === "ready",
  );
  await reader.evaluate(() =>
    (window as any).__MYZ_PDF__.selectText("Page One Alpha", 1),
  );
  await reader.evaluate(() =>
    (window as any).__MYZ_PDF__.createAnnotation("highlight"),
  );
  await reader.close();
}

test("dashboard_shows_pdf_page_and_opens_reader_at_page", async () => {
  const pdfUrl = `${serverUrl}/myz-pdf-reader.pdf`;
  await createPdfAnnotation(pdfUrl);

  const dashboard: Page = await context.newPage();
  await dashboard.goto(
    `chrome-extension://${extensionId}/src/dashboard/index.html`,
  );
  await dashboard.waitForSelector("[data-id]");

  await expect(dashboard.getByText("第 1 页").first()).toBeVisible();
  const openButton = dashboard.getByTitle("在阅读器中打开").first();
  await expect(openButton).toBeVisible();
  await dashboard.screenshot({ path: `${SHOT_DIR}/dashboard-pdf.png` });
  console.log(`SHOT ${SHOT_DIR}/dashboard-pdf.png`);

  const [readerPage] = await Promise.all([
    context.waitForEvent("page"),
    openButton.click(),
  ]);
  await readerPage.waitForLoadState();
  const readerUrl = readerPage.url();
  console.log("READER_URL", readerUrl);
  expect(readerUrl).toContain("pdf-viewer.html");
  expect(readerUrl).toContain("page=1");
  expect(readerUrl).toContain(encodeURIComponent(pdfUrl));
  await readerPage.waitForFunction(() => Boolean((window as any).__MYZ_PDF__));
  await readerPage.waitForFunction(
    () =>
      (window as any).__MYZ_PDF__?.getState().status === "ready" &&
      (window as any).__MYZ_PDF__.getState().page === 1,
  );
  await readerPage.close();
  await dashboard.close();
});
