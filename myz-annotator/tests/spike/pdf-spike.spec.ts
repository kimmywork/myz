import { test, expect, BrowserContext, Page } from "@playwright/test";
import fs from "node:fs";
import { Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchExtension } from "../helpers/launch-extension.js";
import { createStaticServer } from "../helpers/static-server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REMOTE_PDF =
  "https://wiki.kimleo.net/static/file/doc/Swift-Embrace-Change.pdf";

let context: BrowserContext;
let extensionId: string | null;
let server: Server;
let serverUrl: string;

test.beforeAll(async () => {
  const extensionPath = path.join(__dirname, "..", "..", "dist");
  const launched = await launchExtension(extensionPath);
  context = launched.context;
  extensionId = launched.extensionId;
  if (!extensionId) {
    throw new Error("Could not determine extension id");
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

async function openSpike(): Promise<{ page: Page; errors: string[] }> {
  const errors: string[] = [];
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`console: ${message.text()}`);
    }
  });
  await page.goto(`chrome-extension://${extensionId}/src/pdf/spike.html`);
  await page.waitForFunction(() => Boolean((window as any).__SPIKE__));
  return { page, errors };
}

test("spike_backdoor_renders_selects_highlights_fingerprints", async () => {
  const { page, errors } = await openSpike();
  const fixturePath = path.join(
    __dirname,
    "..",
    "fixtures",
    "myz-pdf-spike.pdf",
  );
  const bytes = Array.from(fs.readFileSync(fixturePath));

  const result = await page.evaluate(async (data: number[]) => {
    const api = (window as any).__SPIKE__;
    const fpBefore = await api.fingerprint(new Uint8Array(data).buffer);
    const buffer = new Uint8Array(data).buffer;
    const loaded = await api.loadBytes(buffer, "fixture");
    const selection = await api.selectByText("Hello World");
    const overlayCount = selection ? api.drawHighlight(selection.rects) : 0;
    return {
      loaded,
      selection,
      overlayCount,
      fpBefore,
      state: api.getState(),
      fsaSupported: api.fsaSupported,
    };
  }, bytes);

  console.log("SPIKE_RESULT_BACKDOOR", JSON.stringify(result, null, 2));
  expect(result.loaded.pages).toBe(1);
  expect(result.selection?.text).toContain("Hello World");
  expect(result.selection?.rects.length).toBeGreaterThan(0);
  expect(result.overlayCount).toBeGreaterThan(0);
  expect(result.loaded.fingerprint).toBe(result.fpBefore.hash);
  expect(result.fpBefore.size).toBe(608);
  expect(result.fsaSupported).toBe(true);
  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});

test("spike_remote_url_loads_cross_origin", async () => {
  const { page, errors } = await openSpike();
  const result = await page.evaluate(async (url: string) => {
    const api = (window as any).__SPIKE__;
    const loaded = await api.loadUrl(url);
    const selection = await api.selectByText("Swift");
    const overlayCount = selection ? api.drawHighlight(selection.rects) : 0;
    return { loaded, selection, overlayCount, state: api.getState() };
  }, REMOTE_PDF);

  console.log("SPIKE_RESULT_REMOTE", JSON.stringify(result, null, 2));
  expect(result.loaded.pages).toBeGreaterThan(0);
  expect(result.overlayCount).toBeGreaterThan(0);
  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});

test("spike_no_cors_origin_loads_via_host_permission", async () => {
  const { page, errors } = await openSpike();
  const result = await page.evaluate(async (url: string) => {
    const api = (window as any).__SPIKE__;
    const loaded = await api.loadUrl(url);
    return { loaded, state: api.getState() };
  }, `${serverUrl}/myz-pdf-spike.pdf`);

  console.log("SPIKE_RESULT_NOCORS", JSON.stringify(result, null, 2));
  expect(result.loaded.pages).toBe(1);
  expect(errors, errors.join("\n")).toHaveLength(0);
  await page.close();
});
