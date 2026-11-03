import { test, expect, BrowserContext, Page } from "@playwright/test";
import { Server } from "node:http";
import path from "node:path";
import { launchExtension } from "../helpers/launch-extension.js";
import { dirnameFromImportMeta } from "../helpers/runtime.js";
import { createStaticServer } from "../helpers/static-server.js";

const __dirname = dirnameFromImportMeta(import.meta.url);

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
 * Deterministic on-device engine stand-in: records every request so the test
 * can assert that only viewport blocks are translated, and that the target
 * language is honoured.
 */
/** Serializable so it can run both now and on every later navigation. */
function mockEngineSource() {
  const calls: { source: string; target: string; text: string }[] = [];
  (window as any).__MOCK_TRANSLATE_CALLS__ = calls;
  (window as any).__MYZ_TRANSLATE_ENGINE__ = {
    async availability() {
      return "available";
    },
    async detect() {
      return [{ detectedLanguage: "en", confidence: 0.9 }];
    },
    async ensureTranslator() {},
    async translate(source: string, target: string, text: string) {
      calls.push({ source, target, text });
      return `译：${text}`;
    },
    destroy() {},
  };
}

async function installMockEngine(page: Page) {
  await page.evaluate(mockEngineSource);
}

/** Clears reader preferences and the translation cache for this origin. */
async function resetStorage(page: Page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Storage.clearDataForOrigin", {
    origin: `chrome-extension://${extensionId}`,
    storageTypes: "indexeddb,local_storage",
  });
  await cdp.detach();
}

async function openReader(): Promise<{ page: Page; errors: string[] }> {
  const errors: string[] = [];
  const page = await context.newPage();
  await resetStorage(page);
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`console: ${message.text()}`);
    }
  });
  await page.goto(
    `chrome-extension://${extensionId}/src/epub/epub-viewer.html`,
  );
  await page.waitForFunction(() => Boolean((window as any).__MYZ_EPUB__));
  await page.evaluate(
    (url) => (window as any).__MYZ_EPUB__.openUrl(url),
    `${serverUrl}/epub/long.epub`,
  );
  await page.waitForFunction(
    () => (window as any).__MYZ_EPUB__.getState().status === "ready",
    undefined,
    { timeout: 15000 },
  );
  // Let the frame load and apply the chapter before measuring anything.
  await page.waitForTimeout(300);
  return { page, errors };
}

async function bilingualState(page: Page) {
  return page.evaluate(() => (window as any).__MYZ_EPUB__.getBilingualState());
}

async function enableFromMenu(page: Page, label = "简体中文") {
  await page.locator(".myz-bilingual-control__toggle").click();
  await expect(page.locator(".myz-bilingual-menu")).toBeVisible();
  await page.locator(".myz-bilingual-menu__option", { hasText: label }).click();
  await expect(page.locator(".epub-bilingual")).toBeVisible();
}

test("epub_bilingual_translates_only_visible_blocks", async () => {
  const { page, errors } = await openReader();
  await installMockEngine(page);
  await enableFromMenu(page);

  await page.waitForFunction(
    () => (window as any).__MYZ_EPUB__.getBilingualState().doneBlocks > 0,
    undefined,
    { timeout: 10000 },
  );

  const first = await bilingualState(page);
  expect(first.enabled).toBe(true);
  expect(first.targetLanguage).toBe("zh");
  expect(first.blocks).toBeGreaterThan(3);
  // A long chapter cannot be fully on screen: the rest waits for scrolling.
  expect(first.doneBlocks).toBeGreaterThan(0);
  expect(first.doneBlocks).toBeLessThan(first.blocks);

  // Every translated block was requested because it was fully visible.
  const translated = await page.evaluate(() =>
    (window as any).__MOCK_TRANSLATE_CALLS__.map(
      (call: { text: string }) => call.text,
    ),
  );
  const visibleTexts: string[] = await page.evaluate(() => {
    const frame = document.querySelector(
      ".epub-frame",
    ) as HTMLIFrameElement | null;
    const doc = frame?.contentDocument;
    const win = frame?.contentWindow;
    if (!doc || !win) return [];
    const result: string[] = [];
    const selector =
      "p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,td,th,dt,dd,figcaption,div,section,article";
    for (const el of Array.from(
      doc.body.querySelectorAll<HTMLElement>(selector),
    )) {
      if (el.querySelector(selector)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.height < 6 || rect.width < 20) continue;
      if (rect.top >= 0 && rect.bottom <= win.innerHeight) {
        result.push((el.textContent || "").replace(/\s+/g, " ").trim());
      }
    }
    return result;
  });
  for (const text of translated) {
    expect(visibleTexts).toContain(text);
  }

  // Scrolling asks for the next blocks.
  await page.evaluate(() => {
    const frame = document.querySelector(".epub-frame") as HTMLIFrameElement;
    frame.contentWindow?.scrollTo(0, 900);
  });
  await page.waitForFunction(
    (before) =>
      (window as any).__MYZ_EPUB__.getBilingualState().doneBlocks > before,
    first.doneBlocks,
    { timeout: 10000 },
  );

  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});

test("epub_bilingual_keeps_translation_aligned_with_the_text", async () => {
  const { page, errors } = await openReader();
  await installMockEngine(page);
  await enableFromMenu(page);

  await page.waitForFunction(
    () => (window as any).__MYZ_EPUB__.getBilingualState().doneBlocks > 0,
    undefined,
    { timeout: 10000 },
  );

  const frame = page.frameLocator(".epub-frame");
  const source = await frame.locator("h1").boundingBox();
  const block = await page
    .locator(".epub-bilingual .myz-bilingual__block")
    .first()
    .boundingBox();
  if (!source || !block) throw new Error("missing geometry");

  expect(Math.abs(block.y - source.y)).toBeLessThanOrEqual(8);
  await expect(
    page.locator(".epub-bilingual .myz-bilingual__block").first(),
  ).toHaveText("译：Chapter One");

  await page.screenshot({ path: "/tmp/epub-bilingual.png" });
  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});

test("epub_bilingual_switches_target_and_closes", async () => {
  const { page, errors } = await openReader();
  await installMockEngine(page);
  await enableFromMenu(page);
  await page.waitForFunction(
    () => (window as any).__MYZ_EPUB__.getBilingualState().doneBlocks > 0,
    undefined,
    { timeout: 10000 },
  );

  await page.locator(".myz-bilingual-control__caret").click();
  await page
    .locator(".myz-bilingual-menu__option", { hasText: "日本語" })
    .click();
  await page.waitForFunction(
    () =>
      (window as any).__MYZ_EPUB__.getBilingualState().targetLanguage === "ja",
  );
  await page.waitForFunction(() => {
    const calls = (window as any).__MOCK_TRANSLATE_CALLS__;
    return calls.some((call: { target: string }) => call.target === "ja");
  });
  await expect(
    page.locator(".epub-bilingual .myz-bilingual__block").first(),
  ).toHaveText("译：Chapter One");

  await page.locator(".myz-bilingual-control__toggle").click();
  await expect(page.locator(".epub-bilingual")).toBeHidden();
  const state = await bilingualState(page);
  expect(state.enabled).toBe(false);

  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});

test("epub_bilingual_wheel_over_translation_scrolls_the_chapter", async () => {
  const { page, errors } = await openReader();
  await installMockEngine(page);
  await enableFromMenu(page);
  await page.waitForFunction(
    () => (window as any).__MYZ_EPUB__.getBilingualState().doneBlocks > 0,
    undefined,
    { timeout: 10000 },
  );
  const before = await bilingualState(page);
  const scrollBefore = await page.evaluate(
    () =>
      (document.querySelector(".epub-frame") as HTMLIFrameElement).contentWindow
        ?.scrollY ?? 0,
  );

  // The translation column has no scrollbar of its own: wheeling over it must
  // scroll the chapter, which in turn asks for the next visible blocks.
  await page.locator(".epub-bilingual").hover();
  await page.mouse.wheel(0, 700);
  await page.waitForFunction(
    (previous) => {
      const frame = document.querySelector(
        ".epub-frame",
      ) as HTMLIFrameElement | null;
      return (frame?.contentWindow?.scrollY ?? 0) > previous + 200;
    },
    scrollBefore,
    { timeout: 10000 },
  );
  await page.waitForFunction(
    (previous) =>
      (window as any).__MYZ_EPUB__.getBilingualState().doneBlocks > previous,
    before.doneBlocks,
    { timeout: 10000 },
  );

  // The mirrored column keeps following the scroll offset.
  const offset = await page.evaluate(() => {
    const frame = document.querySelector(
      ".epub-frame",
    ) as HTMLIFrameElement | null;
    const content = document.querySelector(
      ".epub-bilingual__content",
    ) as HTMLElement | null;
    return {
      scrollY: frame?.contentWindow?.scrollY ?? 0,
      transform: content?.style.transform ?? "",
    };
  });
  expect(offset.transform).toContain(`-${Math.round(offset.scrollY)}px`);

  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});

test("epub_bilingual_keeps_working_after_reopen", async () => {
  const { page, errors } = await openReader();
  await installMockEngine(page);
  await enableFromMenu(page);
  await page.waitForFunction(
    () => (window as any).__MYZ_EPUB__.getBilingualState().doneBlocks > 0,
    undefined,
    { timeout: 10000 },
  );

  // Reloading keeps the persisted toggle; opening a book then enters the mode
  // without a click, so the engine must resolve on the first block request.
  await page.addInitScript(mockEngineSource);
  await page.reload();
  await page.waitForFunction(() => Boolean((window as any).__MYZ_EPUB__));
  await page.evaluate(
    (url) => (window as any).__MYZ_EPUB__.openUrl(url),
    `${serverUrl}/epub/long.epub`,
  );
  await page.waitForFunction(
    () => (window as any).__MYZ_EPUB__.getState().status === "ready",
    undefined,
    { timeout: 15000 },
  );
  await expect(page.locator(".epub-bilingual")).toBeVisible();
  await expect(page.locator(".myz-bilingual-alert")).toHaveCount(0);
  await page.waitForFunction(
    () => (window as any).__MYZ_EPUB__.getBilingualState().doneBlocks > 0,
    undefined,
    { timeout: 10000 },
  );
  expect((await bilingualState(page)).enabled).toBe(true);

  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});
