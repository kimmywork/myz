import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import path from "node:path";
import { launchExtension } from "../helpers/launch-extension.js";
import { send } from "../helpers/runtime.js";
import { dirnameFromImportMeta } from "../helpers/runtime.js";
import { createStaticServer } from "../helpers/static-server.js";

const __dirname = dirnameFromImportMeta(import.meta.url);

let context: BrowserContext;
let extensionId: string;
let serverUrl: string;
let closeServer: () => Promise<void>;

test.beforeAll(async () => {
  const launched = await launchExtension(
    path.join(__dirname, "..", "..", "dist"),
  );
  context = launched.context;
  extensionId = launched.extensionId!;
  const server = createStaticServer(path.join(__dirname, "..", "fixtures"));
  const listen = await server.listen(0);
  serverUrl = listen.url;
  closeServer = () =>
    new Promise<void>((resolve, reject) =>
      listen.server.close((err) => (err ? reject(err) : resolve())),
    );
});

test.afterAll(async () => {
  await context.close();
  await closeServer();
});

async function nudgeRefresh(page: Page) {
  // Any records change makes readers reload; the pending id must stay hidden.
  await send(page, "myz:saveHighlight", {
    url: `${serverUrl}/refresh.html`,
    sourceUrl: `${serverUrl}/refresh.html`,
    title: "refresh nudge",
    text: "refresh nudge",
    html: "<p>refresh nudge</p>",
    note: "",
    tags: [],
    kind: "clip",
  });
}

test("epub_pending_delete_survives_refresh_and_commits_on_teardown", async () => {
  const page = await context.newPage();
  await page.goto(
    `chrome-extension://${extensionId}/src/epub/epub-viewer.html`,
  );
  await page.waitForFunction(() => Boolean((window as any).__MYZ_EPUB__));
  await page.evaluate(
    (url) => (window as any).__MYZ_EPUB__.openUrl(url),
    `${serverUrl}/epub/sample.epub`,
  );
  await page.waitForFunction(
    () => (window as any).__MYZ_EPUB__.getState().status === "ready",
  );
  await page.evaluate(() =>
    (window as any).__MYZ_EPUB__.createHighlightByText(
      "Alpha body text",
      "highlight",
    ),
  );
  const frame = page.frameLocator(".epub-frame");
  await expect(frame.locator("mark.myz-highlight")).toHaveCount(1);

  await frame.locator("mark.myz-highlight").first().click();
  await page
    .locator(".reader-inspector")
    .getByRole("button", { name: "删除" })
    .click();
  await expect(page.getByTestId("undo-toast")).toBeVisible();

  // A reload during the window must not paint the pending record back.
  await nudgeRefresh(page);
  await page.waitForTimeout(300);
  await expect(frame.locator("mark.myz-highlight")).toHaveCount(0);

  // Undo brings it back.
  await page
    .getByTestId("undo-toast")
    .getByRole("button", { name: "撤销" })
    .click();
  await expect(frame.locator("mark.myz-highlight")).toHaveCount(1);

  // Delete again and let the window expire: committed and gone.
  await frame.locator("mark.myz-highlight").first().click();
  await page
    .locator(".reader-inspector")
    .getByRole("button", { name: "删除" })
    .click();
  await expect(page.getByTestId("undo-toast")).toHaveCount(0, {
    timeout: 9000,
  });
  await expect(frame.locator("mark.myz-highlight")).toHaveCount(0);

  // Closing the page during the window commits instead of dropping.
  await page.evaluate(() =>
    (window as any).__MYZ_EPUB__.createHighlightByText(
      "Alpha body text",
      "highlight",
    ),
  );
  await frame.locator("mark.myz-highlight").first().click();
  await page
    .locator(".reader-inspector")
    .getByRole("button", { name: "删除" })
    .click();
  await expect(page.getByTestId("undo-toast")).toBeVisible();
  await page.close();

  const reopened = await context.newPage();
  await reopened.goto(
    `chrome-extension://${extensionId}/src/epub/epub-viewer.html`,
  );
  await reopened.waitForFunction(() => Boolean((window as any).__MYZ_EPUB__));
  await reopened.evaluate(
    (url) => (window as any).__MYZ_EPUB__.openUrl(url),
    `${serverUrl}/epub/sample.epub`,
  );
  await reopened.waitForFunction(
    () => (window as any).__MYZ_EPUB__.getState().status === "ready",
  );
  await expect
    .poll(
      () =>
        reopened.evaluate(
          () => (window as any).__MYZ_EPUB__.getState().highlightCount,
        ),
      { timeout: 8000 },
    )
    .toBe(0);
  await reopened.close();
});

test("pdf_pending_delete_survives_refresh", async () => {
  const page = await context.newPage();
  await page.goto(
    `chrome-extension://${extensionId}/src/pdf/pdf-viewer.html?url=${encodeURIComponent(
      `${serverUrl}/myz-pdf-reader.pdf`,
    )}`,
  );
  await page.waitForFunction(() => Boolean((window as any).__MYZ_PDF__));
  await page.waitForFunction(
    () => (window as any).__MYZ_PDF__?.getState().status === "ready",
  );
  await page.evaluate(() =>
    (window as any).__MYZ_PDF__.selectText("Page One Alpha", 1),
  );
  await page.evaluate(() =>
    (window as any).__MYZ_PDF__.createAnnotation("highlight"),
  );
  await expect(page.locator(".reader-inspector")).toBeVisible();

  await page.locator(".reader-inspector__delete").click();
  await expect(page.getByTestId("undo-toast")).toBeVisible();

  await nudgeRefresh(page);
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(
      () => (window as any).__MYZ_PDF__.getAnnotations().length,
    ),
  ).toBe(0);

  await page
    .getByTestId("undo-toast")
    .getByRole("button", { name: "撤销" })
    .click();
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as any).__MYZ_PDF__.getAnnotations().length,
        ),
      { timeout: 5000 },
    )
    .toBe(1);
  await page.close();
});
