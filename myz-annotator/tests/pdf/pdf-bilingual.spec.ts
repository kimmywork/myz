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

/**
 * Each test starts from empty reader preferences and an empty translation
 * cache: the bilingual toggle and translations are persisted per extension
 * origin, so a previous test would otherwise pre-answer this one.
 */
async function resetStorage(page: Page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Storage.clearDataForOrigin", {
    origin: `chrome-extension://${extensionId}`,
    storageTypes: "indexeddb,local_storage",
  });
  await cdp.detach();
}

async function openReader(
  fixture = "myz-pdf-paged.pdf",
  viewport = { width: 1280, height: 620 },
): Promise<{ page: Page; errors: string[] }> {
  const errors: string[] = [];
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  await resetStorage(page);
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`console: ${message.text()}`);
    }
  });
  const pdfUrl = `${serverUrl}/${fixture}`;
  await page.goto(
    `chrome-extension://${extensionId}/src/pdf/pdf-viewer.html?url=${encodeURIComponent(pdfUrl)}`,
  );
  await page.waitForFunction(() => Boolean((window as any).__MYZ_PDF__));
  await page.waitForFunction(
    () => (window as any).__MYZ_PDF__?.getState().status === "ready",
    undefined,
    { timeout: 15000 },
  );
  await page.waitForFunction(
    () => Boolean(document.querySelector(".pdf-page[data-page='1'] canvas")),
    undefined,
    { timeout: 15000 },
  );
  return { page, errors };
}

async function bilingualState(page: Page) {
  return page.evaluate(() => (window as any).__MYZ_PDF__.getBilingualState());
}

async function enableFromMenu(page: Page, label = "简体中文") {
  await page.locator(".myz-bilingual-control__toggle").click();
  await expect(page.locator(".myz-bilingual-menu")).toBeVisible();
  await page.locator(".myz-bilingual-menu__option", { hasText: label }).click();
  await expect(page.locator(".pdf-bilingual").first()).toBeVisible();
}

/** Source geometry of every painted block, straight from the pane styles. */
async function blockGeometry(page: Page) {
  return page.evaluate(() => {
    const stage = document.querySelector(".reader-stage") as HTMLElement | null;
    if (!stage) return [];
    const stageRect = stage.getBoundingClientRect();
    return Array.from(
      document.querySelectorAll<HTMLElement>(".pdf-bilingual"),
    ).flatMap((pane) => {
      const page = pane.parentElement?.querySelector<HTMLElement>(".pdf-page");
      if (!page) return [];
      const pageRect = page.getBoundingClientRect();
      return Array.from(
        pane.querySelectorAll<HTMLElement>(".myz-bilingual__block"),
      ).map((el) => {
        const top = pageRect.top + Number.parseFloat(el.style.top || "0");
        const height = Number.parseFloat(el.style.minHeight || "0");
        return {
          text: el.textContent || "",
          state: el.dataset.state || "idle",
          top,
          height,
          left: Number.parseFloat(el.style.left || "0"),
          width: Number.parseFloat(el.style.width || "0"),
          pageWidth: pageRect.width,
          pageTop: pageRect.top,
          paneTop: pane.getBoundingClientRect().top,
          stageTop: stageRect.top,
          stageBottom: stageRect.bottom,
        };
      });
    });
  });
}

test("pdf_bilingual_translates_only_fully_visible_blocks", async () => {
  const { page, errors } = await openReader();
  await installMockEngine(page);
  await enableFromMenu(page);

  await page.waitForFunction(
    () => (window as any).__MYZ_PDF__.getBilingualState().doneBlocks > 0,
    undefined,
    { timeout: 10000 },
  );

  const state = await bilingualState(page);
  expect(state.enabled).toBe(true);
  expect(state.targetLanguage).toBe("zh");
  expect(state.blocks).toBeGreaterThan(0);
  // The page is taller than the viewport, so the tail waits for a scroll.
  expect(state.doneBlocks).toBeLessThan(state.blocks);

  const geometry = await blockGeometry(page);
  const done = geometry.filter((block) => block.state === "done");
  expect(done.length).toBeGreaterThan(0);
  const translated = await page.evaluate(() =>
    (window as any).__MOCK_TRANSLATE_CALLS__.map(
      (call: { text: string }) => call.text,
    ),
  );
  for (const block of done) {
    expect(translated).toContain(block.text.replace(/^译：/, ""));
    expect(block.top).toBeGreaterThanOrEqual(block.stageTop - 3);
    expect(block.top + block.height).toBeLessThanOrEqual(block.stageBottom + 3);
  }

  // Side-by-side means the two columns start on the same line.
  for (const block of geometry.slice(0, 3)) {
    expect(Math.abs(block.paneTop - block.pageTop)).toBeLessThanOrEqual(1);
  }

  // Scrolling requests the blocks that become fully visible.
  const before = state.doneBlocks;
  await page.evaluate(() => {
    const stage = document.querySelector(".reader-stage") as HTMLElement;
    const next = document.querySelector(
      '.pdf-page[data-page="2"]',
    ) as HTMLElement;
    stage.scrollTop +=
      next.getBoundingClientRect().top - stage.getBoundingClientRect().top;
  });
  await page.waitForFunction(
    (previous) =>
      (window as any).__MYZ_PDF__.getBilingualState().doneBlocks > previous,
    before,
    { timeout: 10000 },
  );

  const after = await bilingualState(page);
  expect(after.doneBlocks).toBeGreaterThan(before);
  // Already translated blocks are never requested twice.
  const calls = await page.evaluate(
    () => (window as any).__MOCK_TRANSLATE_CALLS__,
  );
  const texts = calls.map((call: { text: string }) => call.text);
  expect(new Set(texts).size).toBe(texts.length);

  await page.screenshot({ path: "/tmp/pdf-bilingual.png" });
  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});

test("pdf_bilingual_switches_target_reuses_cache_and_closes", async () => {
  const { page, errors } = await openReader();
  await installMockEngine(page);
  await enableFromMenu(page);
  await page.waitForFunction(
    () => (window as any).__MYZ_PDF__.getBilingualState().doneBlocks > 0,
    undefined,
    { timeout: 10000 },
  );
  const firstCalls = await page.evaluate(
    () => (window as any).__MOCK_TRANSLATE_CALLS__.length,
  );

  // Re-open the menu from the caret and switch to English: everything is
  // re-requested with the new target.
  await page.locator(".myz-bilingual-control__caret").click();
  await page
    .locator(".myz-bilingual-menu__option", { hasText: "日本語" })
    .click();
  await page.waitForFunction(
    () =>
      (window as any).__MYZ_PDF__.getBilingualState().targetLanguage === "ja",
  );
  await page.waitForFunction(
    () =>
      (window as any).__MOCK_TRANSLATE_CALLS__.some(
        (call: { target: string }) => call.target === "ja",
      ),
    undefined,
    { timeout: 10000 },
  );

  // Hiding the column keeps the translations; showing it again is cached and
  // costs no new engine calls (same text, same target).
  await page.locator(".myz-bilingual-control__toggle").click();
  await expect(page.locator(".pdf-bilingual").first()).toBeHidden();
  expect((await bilingualState(page)).enabled).toBe(false);

  const beforeReopen = await page.evaluate(
    () => (window as any).__MOCK_TRANSLATE_CALLS__.length,
  );
  // The target is remembered, so the second click turns the mode straight on
  // instead of asking for the language again.
  await page.locator(".myz-bilingual-control__toggle").click();
  await expect(page.locator(".myz-bilingual-menu")).toHaveCount(0);
  await expect(page.locator(".pdf-bilingual").first()).toBeVisible();
  await page.waitForFunction(
    () => (window as any).__MYZ_PDF__.getBilingualState().doneBlocks > 0,
    undefined,
    { timeout: 10000 },
  );
  const afterReopen = await page.evaluate(
    () => (window as any).__MOCK_TRANSLATE_CALLS__.length,
  );
  // Reopening must not translate the same block for the same target twice. It
  // may still translate a block that only became fully visible now (replay is
  // scoped to the last viewport, not to every block ever requested).
  const pairs = await page.evaluate(() =>
    (window as any).__MOCK_TRANSLATE_CALLS__.map(
      (call: { target: string; text: string }) =>
        `${call.target}\u0000${call.text}`,
    ),
  );
  expect(new Set(pairs).size).toBe(pairs.length);
  expect(afterReopen).toBeGreaterThanOrEqual(beforeReopen);
  expect(afterReopen).toBeGreaterThan(firstCalls);

  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});

test("pdf_bilingual_reports_unsupported_engine", async () => {
  const { page, errors } = await openReader();
  await page.evaluate(() => {
    (window as any).__MYZ_TRANSLATE_ENGINE__ = null;
  });
  await enableFromMenu(page);

  await expect(page.locator(".myz-bilingual-alert")).toContainText(
    "当前浏览器不支持端上翻译",
    { timeout: 10000 },
  );
  expect((await bilingualState(page)).enabled).toBe(true);

  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});

test("pdf_bilingual_keeps_multi_column_blocks_interleaved", async () => {
  const { page, errors } = await openReader("myz-pdf-columns.pdf", {
    width: 1280,
    height: 1100,
  });
  await installMockEngine(page);
  await enableFromMenu(page);
  // Wait for the whole (fits-on-screen) page: geometry is only meaningful once
  // every visible block has settled.
  await page.waitForFunction(
    () => {
      const state = (window as any).__MYZ_PDF__.getBilingualState();
      return (
        state.phase === "ready" &&
        state.blocks > 0 &&
        state.doneBlocks === state.blocks
      );
    },
    undefined,
    { timeout: 10000 },
  );

  const geometry = (await blockGeometry(page)).filter(
    (block) => block.state === "done",
  );
  expect(geometry.length).toBeGreaterThan(3);
  const pageWidth = geometry[0].pageWidth;
  const leftColumn = geometry.filter((block) => block.left < pageWidth * 0.3);
  const mainColumn = geometry.filter((block) => block.left > pageWidth * 0.35);
  expect(leftColumn.length).toBeGreaterThan(0);
  expect(mainColumn.length).toBeGreaterThan(0);

  // A sidebar caption and a main-column paragraph share vertical bands; the
  // translation must stay side by side, not stack in reading order.
  const sideBySide = leftColumn.some((a) =>
    mainColumn.some(
      (b) => a.top < b.top + b.height - 2 && b.top < a.top + a.height - 2,
    ),
  );
  expect(sideBySide).toBe(true);

  // Fixed page positions: no translation is pushed below its source slot by a
  // previous block, so every block keeps its own source top.
  const tops = geometry.map((block) => Math.round(block.top - block.pageTop));
  expect(new Set(tops).size).toBeGreaterThan(1);

  // Positional correspondence: the sidebar caption sits at the same page x/y
  // as its source, instead of following the main column in reading order.
  const caption = geometry.find((block) => block.text.includes("FIGURE"));
  if (!caption) throw new Error("missing translated caption");
  const sourceRect = await page.evaluate((needle) => {
    const pageEl = document.querySelector<HTMLElement>(
      '.pdf-page[data-page="1"]',
    );
    if (!pageEl) return null;
    const pageBox = pageEl.getBoundingClientRect();
    const span = Array.from(
      pageEl.querySelectorAll<HTMLElement>(".textLayer span"),
    ).find((el) => (el.textContent || "").includes(needle));
    if (!span) return null;
    const box = span.getBoundingClientRect();
    return { left: box.left - pageBox.left, top: box.top - pageBox.top };
  }, "FIGURE");
  expect(sourceRect).not.toBeNull();
  const source = sourceRect as { left: number; top: number };
  expect(Math.abs(source.left - caption.left)).toBeLessThanOrEqual(2);
  expect(
    Math.abs(source.top - (caption.top - caption.pageTop)),
  ).toBeLessThanOrEqual(3);

  await page.screenshot({ path: "/tmp/pdf-bilingual-columns.png" });
  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});

test("pdf_bilingual_keeps_working_after_reload", async () => {
  const { page, errors } = await openReader();
  await installMockEngine(page);
  await enableFromMenu(page);
  await page.waitForFunction(
    () => (window as any).__MYZ_PDF__.getBilingualState().doneBlocks > 0,
    undefined,
    { timeout: 10000 },
  );

  // The toggle is persisted, so a reload re-enters the bilingual mode before
  // any click. The engine has to be resolvable at that point.
  await page.addInitScript(mockEngineSource);
  await page.reload();
  await page.waitForFunction(
    () => (window as any).__MYZ_PDF__?.getState().status === "ready",
    undefined,
    { timeout: 15000 },
  );
  await expect(page.locator(".pdf-bilingual").first()).toBeVisible();
  await expect(page.locator(".myz-bilingual-alert")).toHaveCount(0);
  await page.waitForFunction(
    () => (window as any).__MYZ_PDF__.getBilingualState().doneBlocks > 0,
    undefined,
    { timeout: 10000 },
  );
  expect((await bilingualState(page)).enabled).toBe(true);

  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});
