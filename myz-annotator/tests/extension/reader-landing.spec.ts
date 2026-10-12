import { test, expect, BrowserContext } from "@playwright/test";
import path from "node:path";
import { launchExtension } from "../helpers/launch-extension.js";
import { dirnameFromImportMeta } from "../helpers/runtime.js";

const __dirname = dirnameFromImportMeta(import.meta.url);

let context: BrowserContext;
let extensionId: string | null;

test.beforeAll(async () => {
  const launched = await launchExtension(
    path.join(__dirname, "..", "..", "dist"),
  );
  context = launched.context;
  extensionId = launched.extensionId;
});

test.afterAll(async () => {
  await context.close();
});

test("pdf_reader_landing_has_no_toolbar", async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/pdf/pdf-viewer.html`);
  await page.waitForFunction(() => Boolean((window as any).__MYZ_PDF__));
  await page.waitForFunction(
    () => (window as any).__MYZ_PDF__.getState().status === "landing",
  );
  await expect(page.locator(".reader-landing")).toBeVisible();
  await expect(page.getByRole("button", { name: "返回文库" })).toBeVisible();
  await expect(page.locator(".reader-toolbar")).toHaveCount(0);
  await page.close();
});

test("epub_reader_landing_has_no_toolbar", async () => {
  const page = await context.newPage();
  await page.goto(
    `chrome-extension://${extensionId}/src/epub/epub-viewer.html`,
  );
  await page.waitForFunction(() => Boolean((window as any).__MYZ_EPUB__));
  await expect(page.locator(".reader-landing")).toBeVisible();
  await expect(page.getByRole("button", { name: "返回文库" })).toBeVisible();
  await expect(page.locator(".epub-toolbar")).toHaveCount(0);
  await page.close();
});
