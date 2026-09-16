import { test, expect, BrowserContext, Page } from "@playwright/test";
import { Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchExtension } from "../helpers/launch-extension.js";
import { createStaticServer } from "../helpers/static-server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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
  await page.goto(url);
  await page.waitForFunction(() => Boolean((window as any).__MYZ_PDF__));
  return { page, errors };
}

function mixedUrl(): string {
  return `chrome-extension://${extensionId}/src/pdf/pdf-viewer.html?url=${encodeURIComponent(
    `${serverUrl}/myz-pdf-mixed.pdf`,
  )}`;
}

async function waitReady(page: Page, timeout = 15000) {
  await page.waitForFunction(
    () => (window as any).__MYZ_PDF__?.getState().status === "ready",
    undefined,
    { timeout },
  );
}

const normalize = (value: string) => value.replace(/\s+/g, " ").trim();

const TARGETS = [
  { name: "latin-mid-span", target: "quick brown fox jumps over the lazy dog" },
  {
    name: "greek-mid-span",
    target: "αβγδεζηθικλμνξοπρστυφχψω",
  },
  { name: "math", target: "√(x² + y²)" },
  { name: "cjk-mid-item", target: "包含简" },
  { name: "mixed-fonts", target: "sans-serif and monospace" },
];

test("pdf_underline_decorates_only_the_selected_text", async () => {
  const { page, errors } = await openReader(mixedUrl());
  await waitReady(page);

  for (const { name, target } of TARGETS) {
    const result = await page.evaluate(
      async ({ target }: { target: string }) => {
        const api = (window as any).__MYZ_PDF__;
        const selected = api.selectText(target, 1);
        if (!selected) {
          return { selected, text: null };
        }
        await api.createAnnotation("highlight");
        const record = api.getActiveAnnotation();
        await api.patchActive({ style: "underline" });
        const wrappers = Array.from(
          document.querySelectorAll(
            `.textLayer span.myz-deco-underline[data-myz-id="${record.id}"]`,
          ),
        );
        return { selected, text: wrappers.map((w) => w.textContent).join("") };
      },
      { target },
    );

    console.log("DECOR", name, JSON.stringify(result));
    expect(result.selected, `${name}: target not found in text layer`).toBe(
      true,
    );
    expect(
      normalize(result.text as string),
      `${name}: decoration text must equal the selection`,
    ).toBe(normalize(target));
  }

  await page.screenshot({ path: `${SHOT_DIR}/pdf-decoration-precise.png` });
  console.log(`SHOT ${SHOT_DIR}/pdf-decoration-precise.png`);
  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});

test("pdf_paint_overlay_matches_selection_extent", async () => {
  const { page, errors } = await openReader(mixedUrl());
  await waitReady(page);
  const target = "quick brown fox jumps over the lazy dog";

  const result = await page.evaluate(
    async ({ target }: { target: string }) => {
      const api = (window as any).__MYZ_PDF__;
      api.selectText(target, 1);
      const range = window.getSelection()!.getRangeAt(0);
      const pageEl = document.querySelector(
        '.pdf-page[data-page="1"]',
      ) as HTMLElement;
      const pageRect = pageEl.getBoundingClientRect();
      const selectionRects = Array.from(range.getClientRects()).map((r) => ({
        x: (r.left - pageRect.left) / pageRect.width,
        right: (r.right - pageRect.left) / pageRect.width,
      }));
      await api.createAnnotation("highlight");
      await api.patchActive({ style: "paint" });
      const overlayRects = Array.from(
        document.querySelectorAll(
          '.pdf-annotation-group[data-style="paint"] .pdf-annotation',
        ),
      ).map((el) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        return {
          x: (r.left - pageRect.left) / pageRect.width,
          right: (r.right - pageRect.left) / pageRect.width,
        };
      });
      return { selectionRects, overlayRects };
    },
    { target },
  );

  const minSelection = Math.min(...result.selectionRects.map((r) => r.x));
  const minOverlay = Math.min(...result.overlayRects.map((r) => r.x));
  const maxSelection = Math.max(...result.selectionRects.map((r) => r.right));
  const maxOverlay = Math.max(...result.overlayRects.map((r) => r.right));
  console.log(
    "PAINT",
    JSON.stringify({ minSelection, minOverlay, maxSelection, maxOverlay }),
  );
  expect(minOverlay).toBeGreaterThanOrEqual(minSelection - 0.01);
  expect(minOverlay).toBeLessThanOrEqual(minSelection + 0.01);
  expect(maxOverlay).toBeLessThanOrEqual(maxSelection + 0.01);
  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});
