import { test, expect, BrowserContext } from "@playwright/test";
import fs from "node:fs";
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
  await context.close();
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

function viewerUrl(): string {
  return `chrome-extension://${extensionId}/src/epub/epub-viewer.html`;
}

test("epub_reader_landing_loads", async () => {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(viewerUrl());
  await page.waitForFunction(() => Boolean((window as any).__MYZ_EPUB__));

  const state = await page.evaluate(() =>
    (window as any).__MYZ_EPUB__.getState(),
  );
  expect(state.status).toBe("landing");
  await expect(
    page.getByRole("button", { name: "打开本地 EPUB" }),
  ).toBeVisible();
  expect(errors).toHaveLength(0);
  await page.close();
});

test("epub_reader_renders_and_navigates", async () => {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(viewerUrl());
  await page.waitForFunction(() => Boolean((window as any).__MYZ_EPUB__));

  await page.evaluate(
    (url) => (window as any).__MYZ_EPUB__.openUrl(url),
    `${serverUrl}/epub/sample.epub`,
  );
  await page.waitForFunction(
    () => (window as any).__MYZ_EPUB__.getState().status === "ready",
    undefined,
    { timeout: 10000 },
  );

  const state = await page.evaluate(() =>
    (window as any).__MYZ_EPUB__.getState(),
  );
  expect(state.title).toBe("示例书");
  expect(state.spineCount).toBe(3);
  expect(state.tocCount).toBe(3);

  const frame = page.frameLocator(".epub-frame");
  await expect(frame.locator("h1")).toContainText("Chapter One");

  // Open the TOC and jump to the second chapter.
  await page.evaluate(() => (window as any).__MYZ_EPUB__.toggleSidebar(true));
  await page.getByRole("button", { name: "Chapter Two" }).click();
  await expect(frame.locator("h1")).toContainText("Chapter Two");

  // Toolbar next moves to chapter three.
  await page.getByRole("button", { name: "下一章" }).click();
  await expect(frame.locator("h1")).toContainText("Chapter Three");

  const after = await page.evaluate(() =>
    (window as any).__MYZ_EPUB__.getState(),
  );
  expect(after.spineIndex).toBe(2);
  expect(errors).toHaveLength(0);
  await page.screenshot({ path: "/tmp/epub-reader.png" });
  await page.close();
});

test("epub_highlight_persists_across_reopen", async () => {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(viewerUrl());
  await page.waitForFunction(() => Boolean((window as any).__MYZ_EPUB__));

  const open = () =>
    page
      .evaluate(
        (url) => (window as any).__MYZ_EPUB__.openUrl(url),
        `${serverUrl}/epub/sample.epub`,
      )
      .then(() =>
        page.waitForFunction(
          () => (window as any).__MYZ_EPUB__.getState().status === "ready",
          undefined,
          { timeout: 10000 },
        ),
      );

  await open();
  const frame = page.frameLocator(".epub-frame");
  await expect(frame.locator("h1")).toContainText("Chapter One");

  const created = await page.evaluate(() =>
    (window as any).__MYZ_EPUB__.createHighlightByText(
      "Alpha body text",
      "highlight",
    ),
  );
  expect(created).toBe(true);
  await expect(frame.locator("mark.myz-highlight")).toHaveCount(1);
  await expect(frame.locator("mark.myz-highlight").first()).toContainText(
    "Alpha body text",
  );

  // Re-open the same book: the stored record must repaint from its range.
  await open();
  await expect(frame.locator("mark.myz-highlight")).toHaveCount(1);

  // Delete removes both the record and the mark.
  const records = await page.evaluate(() =>
    (window as any).__MYZ_EPUB__.getRecords(),
  );
  expect(records.length).toBe(1);
  await page.evaluate(
    (id) => (window as any).__MYZ_EPUB__.deleteHighlight(id),
    records[0].id,
  );
  await expect(frame.locator("mark.myz-highlight")).toHaveCount(0);

  expect(errors).toHaveLength(0);
  await page.close();
});

test("epub_nested_toc_cover_font_and_in_content_links", async () => {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(viewerUrl());
  await page.waitForFunction(() => Boolean((window as any).__MYZ_EPUB__));
  await page.evaluate(
    (url) => (window as any).__MYZ_EPUB__.openUrl(url),
    `${serverUrl}/epub/nested.epub`,
  );
  await page.waitForFunction(
    () => (window as any).__MYZ_EPUB__.getState().status === "ready",
    undefined,
    { timeout: 10000 },
  );

  // Cover page: SVG `<image href>` must be rewritten to a blob url, and the
  // read font must override the book's `body { font-family: Georgia }`.
  const cover = await page.evaluate(() => {
    const frame = document.querySelector(".epub-frame") as HTMLIFrameElement;
    const doc = frame.contentDocument!;
    const image = doc.querySelector("image");
    const href = image?.getAttribute("href") || "";
    return { font: getComputedStyle(doc.body).fontFamily, href };
  });
  expect(cover.font).toContain("Newsreader");
  expect(cover.href.startsWith("blob:")).toBe(true);

  // TOC is collapsed by default; a nested section is not rendered yet.
  await page.evaluate(() => (window as any).__MYZ_EPUB__.toggleSidebar(true));
  await expect(page.getByRole("button", { name: "Chapter One" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Section 1.1" })).toHaveCount(
    0,
  );

  await page.evaluate(() => (window as any).__MYZ_EPUB__.goToChapter(1));
  const frame = page.frameLocator(".epub-frame");
  await expect(frame.locator("h1")).toContainText("Chapter One Heading");

  // Searching the TOC surfaces a nested entry and reports no matches.
  await page.getByLabel("搜索目录").fill("Section");
  await expect(page.getByRole("button", { name: "Section 1.1" })).toBeVisible();
  await page.getByLabel("搜索目录").fill("zzz-no-match");
  await expect(page.locator(".reader-sidebar__hint")).toContainText(
    "没有匹配的目录",
  );
  await page.getByLabel("搜索目录").fill("");

  // Scrolling into a section auto-expands its path and marks it current.
  await page.evaluate(() => {
    const el = document.querySelector(".epub-frame") as HTMLIFrameElement;
    el.contentDocument?.getElementById("s1")?.scrollIntoView();
  });
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const el = document.querySelector(".epub-frame") as HTMLIFrameElement;
        return el.contentWindow?.scrollY ?? 0;
      }),
    )
    .toBeGreaterThan(0);
  await expect(page.locator(".reader-outline__row.is-current")).toContainText(
    "Section 1.1",
  );

  // In-content link navigates to the other chapter.
  await page.evaluate(() => {
    const el = document.querySelector(".epub-frame") as HTMLIFrameElement;
    (
      el.contentDocument?.querySelector("a[data-epub-href]") as HTMLElement
    )?.click();
  });
  await expect
    .poll(async () =>
      page.evaluate(() => (window as any).__MYZ_EPUB__.getState().spineIndex),
    )
    .toBe(2);

  // Annotations tab lists the created highlight.
  await page.evaluate(() =>
    (window as any).__MYZ_EPUB__.createHighlightByText(
      "Chapter Two Beta",
      "highlight",
    ),
  );
  await page.evaluate(() => {
    (window as any).__MYZ_EPUB__.toggleSidebar(true);
  });
  await page.getByRole("button", { name: /^标注/ }).click();
  await expect(page.locator(".reader-hl__item")).toHaveCount(1);

  expect(errors).toHaveLength(0);
  await page.close();
});

test("epub_whole_chapter_highlights_on_a_real_book", async () => {
  const asset = path.join(
    __dirname,
    "..",
    "..",
    "..",
    "assets",
    "The murder of Roger Ackroyd.epub",
  );
  test.skip(!fs.existsSync(asset), "Gutenberg fixture not present");

  // The shared server only exposes tests/fixtures; serve the repo root here so
  // the public-domain book under assets/ can be opened.
  const rootServer = createStaticServer(path.join(__dirname, "..", "..", ".."));
  const listen = await rootServer.listen(0);
  const assetBase = listen.url;

  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  try {
    await page.goto(viewerUrl());
    await page.waitForFunction(() => Boolean((window as any).__MYZ_EPUB__));
    await page.evaluate(
      (url) => (window as any).__MYZ_EPUB__.openUrl(url),
      `${assetBase}/assets/The%20murder%20of%20Roger%20Ackroyd.epub`,
    );
    await page.waitForFunction(
      () => (window as any).__MYZ_EPUB__.getState().status === "ready",
      undefined,
      { timeout: 20000 },
    );

    // Paint three whole chapters; the layout must survive and every mark must
    // stay inline (the regression that broke chapter-wide paint).
    for (const index of [1, 2, 3]) {
      await page.evaluate(
        (i) => (window as any).__MYZ_EPUB__.goToChapter(i),
        index,
      );
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        const frame = document.querySelector(
          ".epub-frame",
        ) as HTMLIFrameElement;
        const doc = frame.contentDocument!;
        const range = doc.createRange();
        range.selectNodeContents(doc.body);
        const selection = doc.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
      });
      await page.evaluate(() =>
        (window as any).__MYZ_EPUB__.createHighlightFromSelection("highlight"),
      );
    }

    const result = await page.evaluate(() => {
      const frame = document.querySelector(".epub-frame") as HTMLIFrameElement;
      const doc = frame.contentDocument!;
      const marks = Array.from(doc.querySelectorAll("mark.myz-highlight"));
      return {
        marks: marks.length,
        nestedBlock: marks.some((m) =>
          m.querySelector("div, p, ul, ol, h1, h2, table, pre, blockquote"),
        ),
        hasHeading: Boolean(doc.querySelector("h1, h2, p")),
      };
    });
    expect(result.marks).toBeGreaterThan(10);
    expect(result.nestedBlock).toBe(false);
    expect(result.hasHeading).toBe(true);
    expect(errors).toHaveLength(0);
  } finally {
    await page.close();
    await new Promise<void>((resolve, reject) =>
      listen.server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test("epub_selection_toolbar_hides_on_deselect", async () => {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(viewerUrl());
  await page.waitForFunction(() => Boolean((window as any).__MYZ_EPUB__));
  await page.evaluate(
    (url) => (window as any).__MYZ_EPUB__.openUrl(url),
    `${serverUrl}/epub/sample.epub`,
  );
  await page.waitForFunction(
    () => (window as any).__MYZ_EPUB__.getState().status === "ready",
    undefined,
    { timeout: 10000 },
  );

  await page.evaluate(() => {
    const frame = document.querySelector(".epub-frame") as HTMLIFrameElement;
    const doc = frame.contentDocument!;
    const paragraph = doc.querySelector("p")!;
    const range = doc.createRange();
    range.selectNodeContents(paragraph);
    const selection = doc.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    paragraph.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await expect(page.locator(".selection-toolbar")).toHaveCount(1);
  await page.screenshot({ path: "/tmp/epub-sel-toolbar.png" });

  await page.evaluate(() => {
    const frame = document.querySelector(".epub-frame") as HTMLIFrameElement;
    const doc = frame.contentDocument!;
    doc.getSelection()?.removeAllRanges();
    doc.body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await expect(page.locator(".selection-toolbar")).toHaveCount(0);

  expect(errors).toHaveLength(0);
  await page.close();
});

test("epub_highlight_inspector_edits_note", async () => {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(viewerUrl());
  await page.waitForFunction(() => Boolean((window as any).__MYZ_EPUB__));
  await page.evaluate(
    (url) => (window as any).__MYZ_EPUB__.openUrl(url),
    `${serverUrl}/epub/sample.epub`,
  );
  await page.waitForFunction(
    () => (window as any).__MYZ_EPUB__.getState().status === "ready",
    undefined,
    { timeout: 10000 },
  );

  await page.evaluate(() =>
    (window as any).__MYZ_EPUB__.createHighlightByText(
      "Chapter One Alpha",
      "highlight",
    ),
  );
  const frame = page.frameLocator(".epub-frame");
  await frame.locator("mark.myz-highlight").first().click();

  const panel = page.locator(".reader-inspector");
  await expect(panel).toBeVisible();
  await panel.locator("textarea").fill("我的 EPUB 批注");
  await panel.getByRole("button", { name: "保存" }).click();

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const records = (window as any).__MYZ_EPUB__.getRecords();
        return records[0]?.note || "";
      }),
    )
    .toBe("我的 EPUB 批注");

  expect(errors).toHaveLength(0);
  await page.close();
});

test("epub_selection_translates_in_shared_popover", async () => {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(viewerUrl());
  await page.waitForFunction(() => Boolean((window as any).__MYZ_EPUB__));
  await page.evaluate(
    (url) => (window as any).__MYZ_EPUB__.openUrl(url),
    `${serverUrl}/epub/sample.epub`,
  );
  await page.waitForFunction(
    () => (window as any).__MYZ_EPUB__.getState().status === "ready",
    undefined,
    { timeout: 10000 },
  );

  await page.evaluate(() => {
    (window as any).__MYZ_TRANSLATE_ENGINE__ = {
      async availability() {
        return "available";
      },
      async detect() {
        return [{ detectedLanguage: "en", confidence: 0.9 }];
      },
      async ensureTranslator(
        _source: string,
        _target: string,
        options?: { onProgress?: (value: number) => void },
      ) {
        options?.onProgress?.(1);
      },
      async translate(_source: string, _target: string, text: string) {
        return `译：${text}`;
      },
      destroy() {},
    };
  });

  await page.evaluate(() => {
    const frame = document.querySelector(".epub-frame") as HTMLIFrameElement;
    const doc = frame.contentDocument!;
    const paragraph = doc.querySelector("p")!;
    const range = doc.createRange();
    range.selectNodeContents(paragraph);
    const selection = doc.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    paragraph.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });

  await expect(page.locator(".selection-toolbar")).toHaveCount(1);
  await page.locator('.selection-toolbar button[title="翻译"]').click();
  await expect(page.locator(".translation-popover__result")).toContainText(
    "译：",
  );
  await page.screenshot({ path: "/tmp/epub-translation.png" });

  expect(errors).toHaveLength(0);
  await page.close();
});
