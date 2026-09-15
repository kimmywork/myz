import { test, expect, BrowserContext, Page } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchExtension } from "../helpers/launch-extension.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REMOTE_PDF =
  "https://wiki.kimleo.net/static/file/doc/Swift-Embrace-Change.pdf";

let context: BrowserContext;
let extensionId: string | null;

test.beforeAll(async () => {
  const launched = await launchExtension(
    path.join(__dirname, "..", "..", "dist"),
  );
  context = launched.context;
  extensionId = launched.extensionId;
  if (!extensionId) throw new Error("no extension id");
});

test.afterAll(async () => {
  await context?.close();
});

async function openSpike(): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/pdf/spike.html`);
  await page.waitForFunction(() => Boolean((window as any).__SPIKE__));
  return page;
}

test("diag_text_layer_and_mouse_selection", async () => {
  const page = await openSpike();
  await page.evaluate(async (url: string) => {
    await (window as any).__SPIKE__.loadUrl(url);
  }, REMOTE_PDF);

  const info = await page.evaluate(() => {
    const layer = document.querySelector(".page .textLayer") as HTMLElement;
    const spans = Array.from(layer.querySelectorAll("span"));
    const target = spans.find((s) => (s.textContent || "").includes("Swift"));
    const style = target ? getComputedStyle(target) : null;
    const rect = target?.getBoundingClientRect();
    return {
      spanCount: spans.length,
      layerText: (layer.textContent || "").slice(0, 60),
      totalScaleFactor: getComputedStyle(layer)
        .getPropertyValue("--total-scale-factor")
        .trim(),
      scaleFactor: getComputedStyle(layer)
        .getPropertyValue("--scale-factor")
        .trim(),
      targetText: target?.textContent,
      targetFontSize: style?.fontSize,
      targetLineHeight: style?.lineHeight,
      targetLeft: (target as HTMLElement)?.style.left,
      targetTop: (target as HTMLElement)?.style.top,
      targetRect: rect
        ? { x: rect.x, y: rect.y, w: rect.width, h: rect.height }
        : null,
    };
  });
  console.log("DIAG_INFO", JSON.stringify(info, null, 2));

  const outDir = process.env.SPIKE_SHOT_DIR || "/tmp";
  const pageEl = page.locator(".page").first();
  await pageEl.screenshot({ path: `${outDir}/pdf-unselected.png` });
  console.log(`DIAG_SHOT ${outDir}/pdf-unselected.png`);

  // Recompute the target rect after the screenshot scrolled the page.
  const rect = await page.evaluate(() => {
    const layer = document.querySelector(".page .textLayer") as HTMLElement;
    const spans = Array.from(layer.querySelectorAll("span"));
    const target = spans.find((s) => (s.textContent || "").includes("Swift"));
    const r = target?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
  });

  // Real mouse-drag selection across the target span.
  if (rect) {
    const y = rect.y + rect.h / 2;
    await page.mouse.move(rect.x + 1, y);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.w - 1, y, { steps: 8 });
    await page.mouse.up();
  }
  const selected = await page.evaluate(() => window.getSelection()?.toString());
  console.log("DIAG_MOUSE_SELECTION", JSON.stringify(selected));
  await pageEl.screenshot({ path: `${outDir}/pdf-selected.png` });
  console.log(`DIAG_SHOT ${outDir}/pdf-selected.png`);

  // Programmatic selection + overlay highlight.
  await page.evaluate(async () => {
    const api = (window as any).__SPIKE__;
    const sel = await api.selectByText("Swift 2");
    if (sel) {
      api.drawHighlight(sel.rects);
    }
  });
  await pageEl.screenshot({ path: `${outDir}/pdf-overlay.png` });
  console.log(`DIAG_SHOT ${outDir}/pdf-overlay.png`);

  await expect(page).toBeTruthy();
  await page.close();
});
