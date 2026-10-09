import { test, type BrowserContext, type Page } from "@playwright/test";
import { Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchExtension } from "./launch-extension.js";
import { createStaticServer } from "./static-server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

/** Send a background message from a dashboard page, unwrapping `data`. */
export async function send<T>(
  page: Page,
  type: string,
  payload?: unknown,
): Promise<T> {
  const response = await page.evaluate(
    async (message: { type: string; payload: unknown }) =>
      new Promise((resolve) => {
        chrome.runtime.sendMessage(message, (result) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(result);
        });
      }),
    { type, payload },
  );
  const typed = response as { ok?: boolean; error?: string; data?: T };
  if (!typed?.ok) {
    throw new Error(`${type} failed: ${typed?.error ?? "no response"}`);
  }
  return typed.data as T;
}
