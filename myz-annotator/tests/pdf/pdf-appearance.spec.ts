import { test, BrowserContext } from "@playwright/test";
import { Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchExtension } from "../helpers/launch-extension.js";
import { createStaticServer } from "../helpers/static-server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_DIR = path.join(__dirname, "..", "screenshots", "out");
const SCHEMES = ["paper", "slate", "celadon", "ochre"] as const;
const THEMES = ["light", "dark"] as const;

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
  const staticServer = createStaticServer(path.join(__dirname, "..", "fixtures"));
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

test("capture_pdf_reader_appearance_matrix", async () => {
  const ext = await context.newPage();
  await ext.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);

  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  const pdfUrl = `${serverUrl}/myz-pdf-reader.pdf`;
  await page.goto(
    `chrome-extension://${extensionId}/src/pdf/pdf-viewer.html?url=${encodeURIComponent(pdfUrl)}`,
  );
  await page.waitForFunction(() => (window as any).__MYZ_PDF__ !== undefined);
  await page.waitForFunction(
    () => (window as any).__MYZ_PDF__?.getState().status === "ready",
    undefined,
    { timeout: 15000 },
  );

  for (const scheme of SCHEMES) {
    for (const theme of THEMES) {
      await ext.evaluate(
        async ({ scheme, theme }) => {
          await new Promise((resolve) =>
            chrome.runtime.sendMessage(
              { type: "myz:updateSettings", payload: { colorScheme: scheme } },
              () => resolve(null),
            ),
          );
          await new Promise<void>((resolve) =>
            chrome.storage.local.set({ "myz:theme": theme }, () => resolve()),
          );
        },
        { scheme, theme },
      );
      await page.reload();
      await page.waitForFunction(
        () => (window as any).__MYZ_PDF__?.getState().status === "ready",
        undefined,
        { timeout: 15000 },
      );
      await page.waitForFunction(
        ({ scheme, theme }) =>
          document.documentElement.dataset.scheme === scheme &&
          document.documentElement.dataset.theme === theme,
        { scheme, theme },
        { timeout: 5000 },
      );
      await page.addStyleTag({
        content: "*{transition:none!important;animation:none!important}",
      });
      await page.waitForTimeout(50);
      await page.screenshot({
        path: path.join(OUT_DIR, `pdf-${scheme}-${theme}.png`),
      });
    }
  }

  await ext.close();
  await page.close();
});
