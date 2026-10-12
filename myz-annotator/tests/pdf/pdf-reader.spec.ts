import { test, expect, BrowserContext, Page } from "@playwright/test";
import fs from "node:fs";
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
  if (!extensionId) {
    throw new Error("no extension id");
  }
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

function readerUrl(query = ""): string {
  return `chrome-extension://${extensionId}/src/pdf/pdf-viewer.html${query}`;
}

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
  await page.goto(url);
  await page.waitForFunction(() => (window as any).__MYZ_PDF__ !== undefined);
  return { page, errors };
}

async function waitReady(page: Page, timeout = 15000) {
  await page.waitForFunction(
    () => (window as any).__MYZ_PDF__?.getState().status === "ready",
    undefined,
    { timeout },
  );
}

async function state(page: Page) {
  return page.evaluate(() => (window as any).__MYZ_PDF__.getState());
}

async function waitPersistedProgress(page: Page, expectedPage: number) {
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as any).__MYZ_PDF__?.getState().persistedPage,
        ),
      { timeout: 10000 },
    )
    .toBe(expectedPage);
}

test("reader_loads_web_pdf_navigates_and_restores_progress", async () => {
  const pdfUrl = `${serverUrl}/myz-pdf-reader.pdf`;
  const { page, errors } = await openReader(
    readerUrl(`?url=${encodeURIComponent(pdfUrl)}`),
  );
  await waitReady(page);

  let current = await state(page);
  expect(current.pages).toBe(2);
  expect(current.page).toBe(1);
  expect(current.label).toContain("myz-pdf-reader.pdf");
  await page.screenshot({ path: `${SHOT_DIR}/reader-web-page1.png` });
  console.log(`SHOT ${SHOT_DIR}/reader-web-page1.png`);

  await page.getByRole("button", { name: "下一页" }).click();
  await page.waitForFunction(
    () => (window as any).__MYZ_PDF__?.getState().page === 2,
  );
  await waitPersistedProgress(page, 2);
  current = await state(page);
  expect(current.page).toBe(2);
  await page.screenshot({ path: `${SHOT_DIR}/reader-web-page2.png` });
  console.log(`SHOT ${SHOT_DIR}/reader-web-page2.png`);

  // Reload: progress must be restored to page 2.
  await page.reload();
  await waitReady(page);
  current = await state(page);
  expect(current.page).toBe(2);
  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});

test("reader_continuous_scroll_tracks_page_and_lazy_renders", async () => {
  const pdfUrl = `${serverUrl}/myz-pdf-many.pdf`;
  const { page, errors } = await openReader(
    readerUrl(`?url=${encodeURIComponent(pdfUrl)}`),
  );
  await waitReady(page);

  let current = await state(page);
  expect(current.pages).toBe(10);
  expect(current.page).toBe(1);
  expect(current.rendered).toBeGreaterThan(0);
  expect(current.rendered).toBeLessThan(10);

  await page.evaluate(() => {
    const stage = document.querySelector(".reader-stage") as HTMLElement;
    const el = stage.querySelector('.pdf-page[data-page="5"]') as HTMLElement;
    stage.scrollTop +=
      el.getBoundingClientRect().top - stage.getBoundingClientRect().top;
  });
  await page.waitForFunction(
    () => (window as any).__MYZ_PDF__?.getState().page === 5,
    undefined,
    { timeout: 10000 },
  );
  await waitPersistedProgress(page, 5);
  current = await state(page);
  expect(current.page).toBe(5);
  await page.screenshot({ path: `${SHOT_DIR}/reader-scroll-page5.png` });
  console.log(`SHOT ${SHOT_DIR}/reader-scroll-page5.png`);

  // Reload: scroll position must be restored to page 5.
  await page.reload();
  await waitReady(page);
  current = await state(page);
  expect(current.page).toBe(5);
  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});

test("reader_loads_extensionless_local_url", async () => {
  const pdfUrl = `${serverUrl}/paper-2606.19348`;
  const { page, errors } = await openReader(
    readerUrl(`?url=${encodeURIComponent(pdfUrl)}`),
  );
  await waitReady(page);
  const current = await state(page);
  expect(current.pages).toBe(2);
  expect(current.label).toContain("paper-2606.19348");
  await page.screenshot({ path: `${SHOT_DIR}/reader-extensionless.png` });
  console.log(`SHOT ${SHOT_DIR}/reader-extensionless.png`);
  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});

test("reader_loads_extensionless_arxiv_url", async () => {
  // Network-dependent (arxiv); disabled to keep the suite offline/stable.
  // The extension-less URL path is covered offline by
  // `reader_loads_extensionless_local_url`.
  test.skip(true, "arxiv network test disabled");
  test.setTimeout(90000);
  const { page, errors } = await openReader(
    readerUrl(`?url=${encodeURIComponent("https://arxiv.org/pdf/2606.19348")}`),
  );
  await waitReady(page, 60000);
  const current = await state(page);
  console.log("ARXIV_STATE", JSON.stringify(current));
  expect(current.pages).toBeGreaterThan(0);
  expect(current.rendered).toBeLessThan(current.pages);
  await page.screenshot({ path: `${SHOT_DIR}/reader-arxiv-page1.png` });
  console.log(`SHOT ${SHOT_DIR}/reader-arxiv-page1.png`);
  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});

test("reader_exposes_pdfjs_wasm_assets", async () => {
  const { page, errors } = await openReader(readerUrl());
  const assets = await page.evaluate(async () => {
    const probe = async (path: string) => {
      const response = await fetch(chrome.runtime.getURL(path));
      return { path, ok: response.ok, status: response.status };
    };
    return Promise.all([
      probe("assets/pdfjs/wasm/openjpeg.wasm"),
      probe("assets/pdfjs/wasm/jbig2.wasm"),
      probe("assets/pdfjs/standard_fonts/FoxitSerif.pfb"),
    ]);
  });
  console.log("PDFJS_ASSETS", JSON.stringify(assets));
  for (const asset of assets) {
    expect(asset.ok, `${asset.path} -> ${asset.status}`).toBe(true);
  }
  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});

test("reader_zoom_in_and_out_rebuilds_pages", async () => {
  const pdfUrl = `${serverUrl}/myz-pdf-many.pdf`;
  const { page, errors } = await openReader(
    readerUrl(`?url=${encodeURIComponent(pdfUrl)}`),
  );
  await waitReady(page);
  let current = await state(page);
  expect(current.scale).toBe(1.5);

  await page.getByRole("button", { name: "放大" }).click();
  await page.waitForFunction(
    () => (window as any).__MYZ_PDF__?.getState().scale === 2,
  );
  await page.waitForFunction(
    () => (window as any).__MYZ_PDF__?.getState().rendered > 0,
  );
  current = await state(page);
  expect(current.scale).toBe(2);
  await page.screenshot({ path: `${SHOT_DIR}/reader-zoom-in.png` });
  console.log(`SHOT ${SHOT_DIR}/reader-zoom-in.png`);

  await page.getByRole("button", { name: "缩小" }).click();
  await page.waitForFunction(
    () => (window as any).__MYZ_PDF__?.getState().scale === 1.5,
  );
  await page.waitForFunction(
    () => (window as any).__MYZ_PDF__?.getState().rendered > 0,
  );
  current = await state(page);
  expect(current.scale).toBe(1.5);
  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});

test("reader_evicts_distant_pages_and_releases_canvas", async () => {
  const pdfUrl = `${serverUrl}/myz-pdf-many.pdf`;
  const { page, errors } = await openReader(
    readerUrl(`?url=${encodeURIComponent(pdfUrl)}`),
  );
  await waitReady(page);

  // The initial page is rendered eagerly.
  await page.waitForFunction(() =>
    Boolean(document.querySelector('.pdf-page[data-page="1"] canvas')),
  );

  // Jump far enough that page 1 falls outside the keep radius.
  await page.evaluate(() => (window as any).__MYZ_PDF__.goToPage(10));
  await page.waitForFunction(
    () => (window as any).__MYZ_PDF__?.getState().page === 10,
    undefined,
    { timeout: 10000 },
  );

  await page.waitForFunction(() => {
    const target = document.querySelector('.pdf-page[data-page="10"] canvas');
    const evicted = document.querySelector('.pdf-page[data-page="1"] canvas');
    return Boolean(target) && !evicted;
  });

  const current = await state(page);
  expect(current.page).toBe(10);
  // Resident pages stay bounded; page 1's bitmap was released.
  expect(current.rendered).toBeLessThan(current.pages);
  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});

test("reader_renders_landing_page_after_direct_scroll_jump", async () => {
  const pdfUrl = `${serverUrl}/myz-pdf-paged.pdf`;
  const { page, errors } = await openReader(
    readerUrl(`?url=${encodeURIComponent(pdfUrl)}`),
  );
  await waitReady(page);

  // Slow the renderer so page renders stay in flight while the scroll position
  // moves, reproducing a scrollbar drag (the path that used to leave the
  // landing pages blank until an extra scroll).
  const client = await context.newCDPSession(page);
  await client.send("Emulation.setCPUThrottlingRate", { rate: 20 });

  await page.evaluate(async () => {
    const stage = document.querySelector(".reader-stage") as HTMLElement;
    const target = stage.querySelector(
      '.pdf-page[data-page="28"]',
    ) as HTMLElement;
    const start = stage.scrollTop;
    const end =
      start +
      (target.getBoundingClientRect().top - stage.getBoundingClientRect().top);
    const steps = 14;
    for (let i = 1; i <= steps; i += 1) {
      stage.scrollTop = start + ((end - start) * i) / steps;
      await new Promise((resolve) =>
        requestAnimationFrame(() => resolve(null)),
      );
    }
  });

  await client.send("Emulation.setCPUThrottlingRate", { rate: 1 });

  await page.waitForFunction(
    () => (window as any).__MYZ_PDF__?.getState().page === 28,
    undefined,
    { timeout: 20000 },
  );

  // The landing page must render on its own and stay rendered (not be evicted).
  await page.waitForFunction(
    () => Boolean(document.querySelector('.pdf-page[data-page="28"] canvas')),
    undefined,
    { timeout: 10000 },
  );

  // It must also be upgraded from the low-res preview to full resolution.
  await page.waitForFunction(
    () => {
      const el = document.querySelector(
        '.pdf-page[data-page="28"]',
      ) as HTMLElement | null;
      const canvas = el?.querySelector("canvas") as HTMLCanvasElement | null;
      return Boolean(canvas && canvas.width >= el!.clientWidth * 0.9);
    },
    undefined,
    { timeout: 10000 },
  );

  await page.waitForTimeout(600);
  const stillRendered = await page.evaluate(() =>
    Boolean(document.querySelector('.pdf-page[data-page="28"] canvas')),
  );
  expect(stillRendered).toBe(true);
  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});

test("reader_loads_local_bytes_via_backdoor", async () => {
  const { page, errors } = await openReader(readerUrl());
  const fixturePath = path.join(
    __dirname,
    "..",
    "fixtures",
    "myz-pdf-reader.pdf",
  );
  const bytes = Array.from(fs.readFileSync(fixturePath));
  const result = await page.evaluate(async (data: number[]) => {
    const api = (window as any).__MYZ_PDF__;
    const fingerprint = await api.openBytes(
      new Uint8Array(data).buffer,
      "local-reader.pdf",
    );
    return { fingerprint, state: api.getState() };
  }, bytes);
  console.log("LOCAL_BACKDOOR", JSON.stringify(result, null, 2));
  expect(result.state.status).toBe("ready");
  expect(result.state.pages).toBe(2);
  expect(result.state.sourceKey).toBe(`myz-pdf:${result.fingerprint}`);
  await page.screenshot({ path: `${SHOT_DIR}/reader-local-page1.png` });
  console.log(`SHOT ${SHOT_DIR}/reader-local-page1.png`);
  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});
