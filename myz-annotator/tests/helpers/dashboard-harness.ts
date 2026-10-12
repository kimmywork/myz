import { test, type BrowserContext, type Page } from "@playwright/test";
import { Server } from "node:http";
import path from "node:path";
import { launchExtension } from "./launch-extension.js";
import { dirnameFromImportMeta, send } from "./runtime.js";
import { createStaticServer } from "./static-server.js";

const __dirname = dirnameFromImportMeta(import.meta.url);

export { send };

export interface DashboardHarness {
  serverUrl(): string;
  context(): BrowserContext;
  extensionId(): string;
  dashboardUrl(): string;
  /** Open the dashboard (optionally at a hash route) and wait for the shell. */
  open(hash?: string): Promise<Page>;
}

/** Shared static server + extension launch for dashboard specs. */
export function setupDashboardHarness(): DashboardHarness {
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

  const dashboardUrl = () =>
    `chrome-extension://${extensionId}/src/dashboard/index.html`;

  return {
    serverUrl: () => serverUrl,
    context: () => context,
    extensionId: () => extensionId!,
    dashboardUrl,
    async open(hash) {
      const page = await context.newPage();
      await page.goto(hash ? `${dashboardUrl()}#${hash}` : dashboardUrl());
      await page.waitForSelector(".app-shell", { timeout: 8000 });
      return page;
    },
  };
}
