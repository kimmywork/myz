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

async function openReader(
  url: string,
): Promise<{ page: Page; errors: string[] }> {
  const errors: string[] = [];
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`console: ${message.text()}`);
    }
  });
  await page.addInitScript(() => localStorage.removeItem("myz-pdf-sidebar"));
  await page.goto(url);
  await page.waitForFunction(() => Boolean((window as any).__MYZ_PDF__));
  return { page, errors };
}

function fixtureUrl(name: string): string {
  return `chrome-extension://${extensionId}/src/pdf/pdf-viewer.html?url=${encodeURIComponent(`${serverUrl}/${name}`)}`;
}

async function waitReady(page: Page, timeout = 15000) {
  await page.waitForFunction(
    () => (window as any).__MYZ_PDF__?.getState().status === "ready",
    undefined,
    { timeout },
  );
}

test("pdf_sidebar_outline_navigates_to_sections", async () => {
  const { page, errors } = await openReader(fixtureUrl("myz-pdf-outline.pdf"));
  await waitReady(page);

  await page.evaluate(() => {
    const api = (window as any).__MYZ_PDF__;
    api.toggleSidebar(true);
    api.setSidebarTab("outline");
  });

  const outlineState = await page.evaluate(() =>
    (window as any).__MYZ_PDF__.getOutlineState(),
  );
  console.log("OUTLINE_STATE", JSON.stringify(outlineState));
  expect(outlineState.status).toBe("ready");
  expect(outlineState.count).toBe(3);

  await expect(page.locator(".reader-sidebar")).toBeVisible();
  await expect(page.locator(".reader-outline__title")).toHaveCount(3);
  // Top-level entries are expanded by default, so the nested section shows.
  await expect(
    page.locator(".reader-outline__title", { hasText: "Section 1.1" }),
  ).toBeVisible();

  await page
    .locator(".reader-outline__title", { hasText: "Chapter Two" })
    .click();
  await page.waitForFunction(
    () => (window as any).__MYZ_PDF__?.getState().page === 3,
  );
  const sidebar = await page.evaluate(() =>
    (window as any).__MYZ_PDF__.getSidebarState(),
  );
  expect(sidebar.open).toBe(true);
  expect(sidebar.tab).toBe("outline");
  await expect(page.locator(".reader-outline__row.is-current")).toHaveCount(1);
  await page.screenshot({ path: `${SHOT_DIR}/pdf-sidebar-outline.png` });
  console.log(`SHOT ${SHOT_DIR}/pdf-sidebar-outline.png`);

  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});

test("pdf_sidebar_highlights_navigate_to_precise_position", async () => {
  const { page, errors } = await openReader(fixtureUrl("myz-pdf-many.pdf"));
  await waitReady(page);

  await page.evaluate(() => (window as any).__MYZ_PDF__.goToPage(2));
  await page.evaluate(() =>
    (window as any).__MYZ_PDF__.selectText("Page 2 of 10", 2),
  );
  await page.evaluate(() =>
    (window as any).__MYZ_PDF__.createAnnotation("highlight"),
  );
  await page.evaluate(() => (window as any).__MYZ_PDF__.goToPage(5));
  await page.evaluate(() =>
    (window as any).__MYZ_PDF__.selectText("Page 5 of 10", 5),
  );
  await page.evaluate(() =>
    (window as any).__MYZ_PDF__.createAnnotation("highlight"),
  );

  await page.evaluate(() => {
    const api = (window as any).__MYZ_PDF__;
    api.toggleSidebar(true);
    api.setSidebarTab("highlights");
  });

  await page.waitForFunction(
    () => (window as any).__MYZ_PDF__.getSidebarState().highlightGroups === 2,
  );
  const counts = await page.evaluate(() =>
    (window as any).__MYZ_PDF__.getState(),
  );
  expect(counts.annotationCount).toBe(2);
  await expect(page.locator(".reader-hl__group")).toHaveCount(2);
  await page.screenshot({ path: `${SHOT_DIR}/pdf-sidebar-highlights.png` });
  console.log(`SHOT ${SHOT_DIR}/pdf-sidebar-highlights.png`);

  // Click the page 2 entry: must jump to the page and activate the record.
  await page
    .locator(".reader-hl__item", { hasText: "Page 2 of 10" })
    .first()
    .click();
  await page.waitForFunction(() => {
    const api = (window as any).__MYZ_PDF__;
    return (
      api.getState().page === 2 &&
      api.getActiveAnnotation()?.pdfLocator?.pageNumber === 2
    );
  });
  const active = await page.evaluate(() =>
    (window as any).__MYZ_PDF__.getActiveAnnotation(),
  );
  expect(active.pdfLocator.pageNumber).toBe(2);
  await expect(page.locator(".reader-hl__item.is-active")).toHaveCount(1);

  // Precise position: the active annotation rect sits inside the viewport.
  const visible = await page.evaluate(() => {
    const stage = document.querySelector(".reader-stage") as HTMLElement;
    const rect = document
      .querySelector(".pdf-annotation-group.is-active .pdf-annotation")
      ?.getBoundingClientRect();
    if (!rect) {
      return null;
    }
    const stageRect = stage.getBoundingClientRect();
    return {
      top: rect.top - stageRect.top,
      height: stageRect.height,
      inside: rect.top >= stageRect.top && rect.bottom <= stageRect.bottom,
    };
  });
  console.log("PRECISE", JSON.stringify(visible));
  expect(visible).not.toBeNull();
  expect(visible?.inside).toBe(true);

  // Filtering by kind hides non-matching entries.
  await page.evaluate(() =>
    (window as any).__MYZ_PDF__.selectText("Page 5 of 10", 5),
  );
  await page.evaluate(() =>
    (window as any).__MYZ_PDF__.createAnnotation("clip"),
  );
  await page.locator(".reader-hl__filter", { hasText: "摘录" }).click();
  const sidebar = await page.evaluate(() =>
    (window as any).__MYZ_PDF__.getSidebarState(),
  );
  expect(sidebar.filter).toBe("clip");

  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});

test("pdf_sidebar_highlights_search_filters", async () => {
  const { page, errors } = await openReader(fixtureUrl("myz-pdf-outline.pdf"));
  await waitReady(page);

  for (const [target, pageNumber] of [
    ["Outline Page One Alpha", 1],
    ["Outline Page Three Gamma", 3],
  ]) {
    await page.evaluate(
      (n) => (window as any).__MYZ_PDF__.goToPage(n),
      pageNumber,
    );
    await page.evaluate(
      ([text, n]) =>
        (window as any).__MYZ_PDF__.selectText(text as string, n as number),
      [target, pageNumber],
    );
    await page.evaluate(() =>
      (window as any).__MYZ_PDF__.createAnnotation("highlight"),
    );
  }

  await page.evaluate(() => {
    const api = (window as any).__MYZ_PDF__;
    api.toggleSidebar(true);
    api.setSidebarTab("highlights");
  });
  await page.waitForFunction(
    () => (window as any).__MYZ_PDF__.getSidebarState().highlightGroups === 2,
  );

  const search = page.locator(".reader-hl__search");
  await expect(search).toBeVisible();

  await search.fill("gamma");
  await expect(page.locator(".reader-hl__group")).toHaveCount(1);
  await expect(page.locator(".reader-hl__item")).toHaveCount(1);
  await expect(page.locator(".reader-hl__item")).toContainText("Gamma");
  await page.screenshot({ path: `${SHOT_DIR}/pdf-sidebar-search.png` });
  console.log(`SHOT ${SHOT_DIR}/pdf-sidebar-search.png`);

  await search.fill("不存在的关键词");
  await expect(page.locator(".reader-hl__item")).toHaveCount(0);
  await expect(page.locator(".reader-state__title")).toContainText(
    "没有匹配的划线",
  );

  await search.fill("");
  await expect(page.locator(".reader-hl__group")).toHaveCount(2);

  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});

test("pdf_sidebar_shows_empty_outline_state", async () => {
  const { page, errors } = await openReader(fixtureUrl("myz-pdf-reader.pdf"));
  await waitReady(page);
  await page.evaluate(() => {
    const api = (window as any).__MYZ_PDF__;
    api.toggleSidebar(true);
    api.setSidebarTab("outline");
  });
  await page.waitForFunction(
    () => (window as any).__MYZ_PDF__.getOutlineState().status === "ready",
  );
  await expect(page.locator(".reader-state__title")).toContainText(
    "该 PDF 没有目录",
  );
  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});
