import { test, type BrowserContext, type Page } from "@playwright/test";
import { Server } from "node:http";
import path from "node:path";
import { launchExtension } from "./launch-extension.js";
import { dirnameFromImportMeta, send } from "./runtime.js";
import { createStaticServer } from "./static-server.js";

const __dirname = dirnameFromImportMeta(import.meta.url);

export { send };

export interface StitchHarness {
  serverUrl(): string;
  context(): BrowserContext;
  /** Open the "MyZ 拼图" page (an extension page) and wait for the app shell. */
  openStitch(): Promise<Page>;
}

/** Shared static server + extension launch for stitch/capture specs. */
export function setupStitchHarness(): StitchHarness {
  let server: Server;
  let serverUrl = "";
  let context: BrowserContext;
  let extensionId: string | null = null;

  test.beforeAll(async () => {
    const fixtures = path.join(__dirname, "..", "fixtures");
    const s = createStaticServer(fixtures);
    const listen = await s.listen(0);
    server = listen.server;
    serverUrl = listen.url;
    const extensionPath = path.join(__dirname, "..", "..", "dist");
    const launched = await launchExtension(extensionPath);
    context = launched.context;
    // Auto-accept confirm() dialogs (the editor uses one for "clear all").
    context.on("page", (page) =>
      page.on("dialog", (dialog) => void dialog.accept()),
    );
    extensionId = launched.extensionId;
    if (!extensionId) {
      throw new Error("Could not determine extension id");
    }
  });

  test.afterAll(async () => {
    await context.close();
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  const stitchUrl = () =>
    `chrome-extension://${extensionId}/src/stitch/stitch.html`;

  return {
    serverUrl: () => serverUrl,
    context: () => context,
    async openStitch() {
      const page = await context.newPage();
      await page.goto(stitchUrl());
      await page.waitForSelector(".app", { timeout: 8000 });
      return page;
    },
  };
}

/** A valid PNG data URL generated in the extension page's own canvas. */
export async function makePngDataUrl(page: Page): Promise<string> {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 6;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.fillStyle = "#c0392b";
    ctx.fillRect(0, 0, 8, 6);
    return canvas.toDataURL("image/png");
  });
}

/** Poll the staged-asset list until `count` items are present. */
export async function waitForStagedCount(
  page: Page,
  count: number,
): Promise<Array<Record<string, unknown>>> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const list = await send<Array<Record<string, unknown>>>(
      page,
      "myz:listStagedAssets",
    );
    if (Array.isArray(list) && list.length >= count) return list;
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${count} staged asset(s)`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }
}
