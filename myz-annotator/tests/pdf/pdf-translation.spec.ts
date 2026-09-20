import { test, expect, BrowserContext, Page } from "@playwright/test";
import { Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchExtension } from "../helpers/launch-extension.js";
import { createStaticServer } from "../helpers/static-server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

/**
 * Publishes a deterministic translation engine on the page. The real model
 * cannot run in CI, so the e2e asserts the whole UI/pipeline instead.
 */
async function installMockEngine(
  page: Page,
  availability: "available" | "unavailable" = "available",
) {
  await page.evaluate((mode) => {
    const counters = { detect: 0, ensure: 0, translate: 0 };
    (window as any).__MOCK_TRANSLATE__ = counters;
    (window as any).__MYZ_TRANSLATE_ENGINE__ = {
      async availability() {
        return mode;
      },
      async detect() {
        counters.detect += 1;
        return [{ detectedLanguage: "en", confidence: 0.9 }];
      },
      async ensureTranslator(
        _source: string,
        _target: string,
        options?: { onProgress?: (value: number) => void },
      ) {
        counters.ensure += 1;
        options?.onProgress?.(1);
      },
      async translate(_source: string, _target: string, text: string) {
        counters.translate += 1;
        return `译：${text}`;
      },
      destroy() {},
    };
  }, availability);
}

async function openReader(): Promise<{ page: Page; errors: string[] }> {
  const errors: string[] = [];
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`console: ${message.text()}`);
    }
  });
  const pdfUrl = `${serverUrl}/myz-pdf-reader.pdf`;
  await page.goto(
    `chrome-extension://${extensionId}/src/pdf/pdf-viewer.html?url=${encodeURIComponent(pdfUrl)}`,
  );
  await page.waitForFunction(() => Boolean((window as any).__MYZ_PDF__));
  await page.waitForFunction(
    () => (window as any).__MYZ_PDF__?.getState().status === "ready",
    undefined,
    { timeout: 15000 },
  );
  return { page, errors };
}

test("pdf_selection_translates_with_on_device_engine", async () => {
  const { page, errors } = await openReader();
  await installMockEngine(page);

  await page.evaluate(() =>
    (window as any).__MYZ_PDF__.selectText("Page One Alpha", 1),
  );
  await expect(page.locator(".selection-toolbar")).toHaveCount(1);
  await page.locator('.selection-toolbar button[title="翻译"]').click();

  const popover = page.locator(".translation-popover");
  await expect(popover).toBeVisible();
  await expect(popover.locator(".translation-popover__langs")).toContainText(
    "英语",
  );
  await expect(popover.locator(".translation-popover__langs")).toContainText(
    "中文",
  );
  await expect(popover.locator(".translation-popover__result")).toContainText(
    "译：Page One Alpha",
  );
  await expect(popover.locator(".translation-popover__copy")).toBeEnabled();
  await page.screenshot({ path: "/tmp/pdf-translation.png" });

  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});

test("pdf_translation_reuses_cache_for_repeated_selection", async () => {
  const { page, errors } = await openReader();
  await installMockEngine(page);

  await page.evaluate(() =>
    (window as any).__MYZ_PDF__.selectText("Page One Alpha", 1),
  );
  await page.locator('.selection-toolbar button[title="翻译"]').click();
  await expect(page.locator(".translation-popover__result")).toContainText(
    "译：Page One Alpha",
  );
  const firstCalls = await page.evaluate(
    () => (window as any).__MOCK_TRANSLATE__.translate,
  );

  await page.locator(".translation-popover__close").click();
  await expect(page.locator(".translation-popover")).toHaveCount(0);
  await expect(page.locator(".selection-toolbar")).toHaveCount(1);

  await page.locator('.selection-toolbar button[title="翻译"]').click();
  await expect(page.locator(".translation-popover__result")).toContainText(
    "译：Page One Alpha",
  );
  const secondCalls = await page.evaluate(
    () => (window as any).__MOCK_TRANSLATE__.translate,
  );
  expect(secondCalls).toBe(firstCalls);

  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});

test("pdf_translation_survives_repeated_open_and_close", async () => {
  const { page, errors } = await openReader();
  await installMockEngine(page);

  await page.evaluate(() =>
    (window as any).__MYZ_PDF__.selectText("Page One Alpha", 1),
  );

  // Every trigger after the first must still reach the popover; passing the
  // popover abort signal into the engine used to destroy it after one use.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.locator('.selection-toolbar button[title="翻译"]').click();
    await expect(page.locator(".translation-popover__result")).toContainText(
      "译：Page One Alpha",
    );
    await expect(page.locator(".translation-popover__error")).toHaveCount(0);
    await page.locator(".translation-popover__close").click();
    await expect(page.locator(".translation-popover")).toHaveCount(0);
    await expect(page.locator(".selection-toolbar")).toHaveCount(1);
  }

  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});

test("pdf_translation_reports_unsupported_pair", async () => {
  const { page, errors } = await openReader();
  await installMockEngine(page, "unavailable");

  await page.evaluate(() =>
    (window as any).__MYZ_PDF__.selectText("Page One Alpha", 1),
  );
  await page.locator('.selection-toolbar button[title="翻译"]').click();

  const popover = page.locator(".translation-popover");
  await expect(popover.locator(".translation-popover__error")).toContainText(
    "暂不支持",
  );
  await expect(popover.locator(".translation-popover__retry")).toBeVisible();

  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});

test("pdf_translation_reports_unsupported_browser", async () => {
  const { page, errors } = await openReader();
  await page.evaluate(() => {
    (window as any).__MYZ_TRANSLATE_ENGINE__ = null;
  });

  await page.evaluate(() =>
    (window as any).__MYZ_PDF__.selectText("Page One Alpha", 1),
  );
  await page.locator('.selection-toolbar button[title="翻译"]').click();

  await expect(page.locator(".translation-popover__error")).toContainText(
    "当前浏览器不支持端上翻译",
  );

  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});
