import { test, expect, BrowserContext, Page } from "@playwright/test";
import fs from "node:fs";
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

async function waitReady(page: Page, timeout = 15000) {
  await page.waitForFunction(
    () => (window as any).__MYZ_PDF__?.getState().status === "ready",
    undefined,
    { timeout },
  );
}

test("pdf_annotate_highlight_and_restore", async () => {
  const pdfUrl = `${serverUrl}/myz-pdf-reader.pdf`;
  const url = `chrome-extension://${extensionId}/src/pdf/pdf-viewer.html?url=${encodeURIComponent(pdfUrl)}`;
  const { page, errors } = await openReader(url);
  await waitReady(page);

  // Select text programmatically (native selection is covered by INC-1).
  const selected = await page.evaluate(() =>
    (window as any).__MYZ_PDF__.selectText("Page One Alpha", 1),
  );
  expect(selected).toBe(true);
  let state = await page.evaluate(() => (window as any).__MYZ_PDF__.getState());
  expect(state.selectionActive).toBe(true);
  await page.screenshot({ path: `${SHOT_DIR}/pdf-selection.png` });
  console.log(`SHOT ${SHOT_DIR}/pdf-selection.png`);

  // Save as a highlight.
  await page.evaluate(() =>
    (window as any).__MYZ_PDF__.createAnnotation("highlight"),
  );
  state = await page.evaluate(() => (window as any).__MYZ_PDF__.getState());
  expect(state.annotationCount).toBe(1);
  expect(state.activeId).toBeTruthy();

  const overlay = await page.evaluate(() => {
    const el = document.querySelector(".pdf-annotation") as HTMLElement | null;
    return el
      ? { count: document.querySelectorAll(".pdf-annotation").length }
      : { count: 0 };
  });
  expect(overlay.count).toBeGreaterThan(0);
  await page.screenshot({ path: `${SHOT_DIR}/pdf-annotated.png` });
  console.log(`SHOT ${SHOT_DIR}/pdf-annotated.png`);

  // Edit note + style.
  await page.evaluate(() =>
    (window as any).__MYZ_PDF__.patchActive({
      note: "关键定义",
      style: "underline",
      tags: ["统计"],
    }),
  );
  const record = await page.evaluate(() => {
    const list = (window as any).__MYZ_PDF__.getAnnotations();
    return list[0];
  });
  expect(record.note).toBe("关键定义");
  expect(record.style).toBe("underline");
  expect(record.tags).toContain("统计");
  expect(record.sourceType).toBe("web");
  expect(record.pdfLocator.pageNumber).toBe(1);
  expect(record.pdfLocator.rects.length).toBeGreaterThan(0);

  // Reload: annotation must be restored from storage.
  await page.reload();
  await page.waitForFunction(() => Boolean((window as any).__MYZ_PDF__));
  await waitReady(page);
  await page.waitForFunction(
    () =>
      (window as any).__MYZ_PDF__.getState().annotationCount === 1 &&
      document.querySelectorAll(".pdf-annotation").length > 0,
  );
  const restored = await page.evaluate(() => {
    const list = (window as any).__MYZ_PDF__.getAnnotations();
    return {
      count: list.length,
      pageNumber: list[0].pdfLocator.pageNumber,
      overlays: document.querySelectorAll(".pdf-annotation").length,
    };
  });
  console.log("RESTORED", JSON.stringify(restored));
  expect(restored.count).toBe(1);
  expect(restored.pageNumber).toBe(1);
  expect(restored.overlays).toBeGreaterThan(0);
  await page.screenshot({ path: `${SHOT_DIR}/pdf-restored.png` });
  console.log(`SHOT ${SHOT_DIR}/pdf-restored.png`);

  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});

test("pdf_multiline_styles_and_overlay", async () => {
  const pdfUrl = `${serverUrl}/myz-pdf-paragraph.pdf`;
  const url = `chrome-extension://${extensionId}/src/pdf/pdf-viewer.html?url=${encodeURIComponent(pdfUrl)}`;
  const { page, errors } = await openReader(url);
  await waitReady(page);

  // Select text spanning two lines so the locator has multiple rects.
  const pageText = await page.evaluate(
    () => document.querySelector(".textLayer")?.textContent || "",
  );
  console.log("PARAGRAPH_TEXT", JSON.stringify(pageText));
  const selected = await page.evaluate(() =>
    (window as any).__MYZ_PDF__.selectText("matter.The correct answer", 1),
  );
  console.log("MULTILINE_SELECTED", selected);
  await page.evaluate(() =>
    (window as any).__MYZ_PDF__.createAnnotation("highlight"),
  );

  const layout = await page.evaluate(() => {
    const group = document.querySelector(
      ".pdf-annotation-group",
    ) as HTMLElement;
    const rects = Array.from(
      document.querySelectorAll(".pdf-annotation"),
    ) as HTMLElement[];
    const boxes = rects.map((el) => el.getBoundingClientRect());
    let overlap = false;
    for (let i = 1; i < boxes.length; i += 1) {
      if (boxes[i].top < boxes[i - 1].bottom - 1) {
        overlap = true;
      }
    }
    const computed = getComputedStyle(rects[0]);
    return {
      groupCount: document.querySelectorAll(".pdf-annotation-group").length,
      rectCount: rects.length,
      overlap,
      outlineStyle: computed.outlineStyle,
      dateStyle: group?.dataset.style,
    };
  });
  console.log("MULTILINE_LAYOUT", JSON.stringify(layout));
  expect(layout.groupCount).toBe(1);
  expect(layout.rectCount).toBeGreaterThanOrEqual(2);
  expect(layout.overlap).toBe(false);
  expect(layout.outlineStyle).toBe("none");

  // Wavy is a real wavy text-decoration on the glyphs.
  await page.evaluate(() =>
    (window as any).__MYZ_PDF__.patchActive({ style: "wavy" }),
  );
  const wavy = await page.evaluate(() => {
    const span = document.querySelector(
      ".textLayer span.myz-deco-wavy",
    ) as HTMLElement | null;
    if (!span) {
      return null;
    }
    const style = getComputedStyle(span);
    return {
      line: style.textDecorationLine,
      decorationStyle: style.textDecorationStyle,
    };
  });
  console.log("WAVY", JSON.stringify(wavy));
  expect(wavy?.line).toContain("underline");
  expect(wavy?.decorationStyle).toBe("wavy");
  await page.screenshot({ path: `${SHOT_DIR}/pdf-wavy.png` });
  console.log(`SHOT ${SHOT_DIR}/pdf-wavy.png`);

  await page.evaluate(() =>
    (window as any).__MYZ_PDF__.patchActive({ style: "underline" }),
  );
  const underline = await page.evaluate(() => {
    const span = document.querySelector(
      ".textLayer span.myz-deco-underline",
    ) as HTMLElement | null;
    return span ? getComputedStyle(span).textDecorationLine : "";
  });
  expect(underline).toContain("underline");
  await page.screenshot({ path: `${SHOT_DIR}/pdf-underline.png` });
  console.log(`SHOT ${SHOT_DIR}/pdf-underline.png`);

  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});

test("pdf_remembers_last_style_and_color", async () => {
  const pdfUrl = `${serverUrl}/myz-pdf-paragraph.pdf`;
  const url = `chrome-extension://${extensionId}/src/pdf/pdf-viewer.html?url=${encodeURIComponent(pdfUrl)}`;

  const first = await openReader(url);
  await waitReady(first.page);
  await first.page.evaluate(() =>
    (window as any).__MYZ_PDF__.selectText("Intuition", 1),
  );
  await first.page.evaluate(() =>
    (window as any).__MYZ_PDF__.createAnnotation("highlight"),
  );
  await first.page.evaluate(() =>
    (window as any).__MYZ_PDF__.patchActive({
      style: "wavy",
      color: "#ef476f",
    }),
  );
  await first.page.waitForFunction(
    () => (window as any).__MYZ_PDF__.getActiveAnnotation()?.style === "wavy",
  );
  await first.page.close();

  const second = await openReader(url);
  await waitReady(second.page);
  await second.page.evaluate(() =>
    (window as any).__MYZ_PDF__.selectText("sample space", 1),
  );
  await second.page.evaluate(() =>
    (window as any).__MYZ_PDF__.createAnnotation("highlight"),
  );
  const created = await second.page.evaluate(() =>
    (window as any).__MYZ_PDF__.getActiveAnnotation(),
  );
  console.log(
    "REMEMBERED",
    JSON.stringify({ style: created.style, color: created.color }),
  );
  expect(created.style).toBe("wavy");
  expect(created.color).toBe("#ef476f");
  expect(second.errors, second.errors.join("\n")).toHaveLength(0);
  await second.page.close();
});

test("pdf_inspector_save_button_persists_note", async () => {
  const pdfUrl = `${serverUrl}/myz-pdf-reader.pdf`;
  const url = `chrome-extension://${extensionId}/src/pdf/pdf-viewer.html?url=${encodeURIComponent(pdfUrl)}`;
  const { page, errors } = await openReader(url);
  await waitReady(page);
  await page.evaluate(() =>
    (window as any).__MYZ_PDF__.selectText("Page One Alpha", 1),
  );
  await page.evaluate(() =>
    (window as any).__MYZ_PDF__.createAnnotation("highlight"),
  );

  const note = page.locator(".reader-inspector__note");
  await note.fill("我的批注");
  const saveButton = page.getByRole("button", { name: "保存" });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  await expect(page.locator(".reader-inspector__status")).toContainText(
    "已保存",
  );
  await expect(saveButton).toBeDisabled();
  const record = await page.evaluate(() =>
    (window as any).__MYZ_PDF__.getActiveAnnotation(),
  );
  expect(record.note).toBe("我的批注");
  await page.screenshot({ path: `${SHOT_DIR}/pdf-inspector-saved.png` });
  console.log(`SHOT ${SHOT_DIR}/pdf-inspector-saved.png`);
  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});

test("pdf_local_annotation_restores_by_fingerprint", async () => {
  const fixturePath = path.join(
    __dirname,
    "..",
    "fixtures",
    "myz-pdf-reader.pdf",
  );
  const bytes = Array.from(fs.readFileSync(fixturePath));

  const first = await openReader(
    `chrome-extension://${extensionId}/src/pdf/pdf-viewer.html`,
  );
  const fingerprint = await first.page.evaluate(async (data: number[]) => {
    return (window as any).__MYZ_PDF__.openBytes(
      new Uint8Array(data).buffer,
      "local.pdf",
    );
  }, bytes);
  await first.page.evaluate(() =>
    (window as any).__MYZ_PDF__.selectText("Page One Alpha", 1),
  );
  await first.page.evaluate(() =>
    (window as any).__MYZ_PDF__.createAnnotation("highlight"),
  );
  const createdState = await first.page.evaluate(() =>
    (window as any).__MYZ_PDF__.getState(),
  );
  expect(createdState.sourceKey).toBe(`myz-pdf:${fingerprint}`);
  expect(createdState.annotationCount).toBe(1);
  await first.page.close();

  // Simulate another device: same file bytes, no persisted handle.
  const second = await openReader(
    `chrome-extension://${extensionId}/src/pdf/pdf-viewer.html`,
  );
  const restoredFingerprint = await second.page.evaluate(
    async (data: number[]) =>
      (window as any).__MYZ_PDF__.openBytes(
        new Uint8Array(data).buffer,
        "local.pdf",
      ),
    bytes,
  );
  expect(restoredFingerprint).toBe(fingerprint);
  await second.page.waitForFunction(
    () =>
      (window as any).__MYZ_PDF__.getState().annotationCount === 1 &&
      document.querySelectorAll(".pdf-annotation").length > 0,
  );
  const restored = await second.page.evaluate(() =>
    (window as any).__MYZ_PDF__.getAnnotations(),
  );
  expect(restored.length).toBe(1);
  expect(restored[0].pdfLocator.pageNumber).toBe(1);
  expect(second.errors, second.errors.join("\n")).toHaveLength(0);
  await second.page.close();
});

test("pdf_clip_saves_without_style", async () => {
  const pdfUrl = `${serverUrl}/myz-pdf-many.pdf`;
  const url = `chrome-extension://${extensionId}/src/pdf/pdf-viewer.html?url=${encodeURIComponent(pdfUrl)}`;
  const { page, errors } = await openReader(url);
  await waitReady(page);
  await page.evaluate(() =>
    (window as any).__MYZ_PDF__.selectText("Page 2 of 10", 2),
  );
  await page.evaluate(() =>
    (window as any).__MYZ_PDF__.createAnnotation("clip"),
  );
  const record = await page.evaluate(
    () => (window as any).__MYZ_PDF__.getAnnotations()[0],
  );
  console.log("CLIP_RECORD", JSON.stringify(record));
  expect(record.kind).toBe("clip");
  expect(record.style).toBeUndefined();
  expect(record.pdfLocator.pageNumber).toBe(2);
  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});
