import { test, expect, BrowserContext } from "@playwright/test";
import { Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchExtension } from "../helpers/launch-extension.js";
import { createStaticServer } from "../helpers/static-server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let server: Server;
let serverUrl: string;
let context: BrowserContext;
let extensionId: string | null;

test.beforeAll(async () => {
  const fixtures = path.join(__dirname, "..", "fixtures");
  const s = createStaticServer(fixtures);
  const listen = await s.listen(0);
  server = listen.server;
  serverUrl = listen.url;

  const extensionPath = path.join(__dirname, "..", "..", "dist");
  const launched = await launchExtension(extensionPath);
  context = launched.context;
  extensionId = launched.extensionId;
  if (!extensionId) {
    throw new Error("Could not determine extension id (extensionId is null).");
  }
});

test.afterAll(async () => {
  await context.close();
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

async function saveClip(
  page: Awaited<ReturnType<BrowserContext["newPage"]>>,
  text: string,
) {
  const canonical = `${serverUrl}/myz-test.html`;
  return page.evaluate<{ ok: boolean }>(
    async (p) =>
      new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: "myz:saveHighlight", payload: p },
          (resp) => {
            if (chrome.runtime.lastError)
              return reject(new Error(chrome.runtime.lastError.message));
            resolve(resp);
          },
        );
      }),
    {
      url: canonical,
      sourceUrl: canonical,
      title: `Inbox ${text}`,
      text,
      html: `<p>${text}</p>`,
      note: "",
      tags: [],
      hostname: new URL(canonical).hostname,
      kind: "clip",
    },
  );
}

test("inbox_triage_focus_mode_undo_and_delete", async () => {
  const dashboardUrl = `chrome-extension://${extensionId}/src/dashboard/index.html`;
  const dash = await context.newPage();
  await dash.goto(dashboardUrl);
  await dash.waitForSelector(".app-shell", { timeout: 5000 });

  await saveClip(dash, "inbox alpha");
  await saveClip(dash, "inbox beta");

  await dash.goto(`${dashboardUrl}#/inbox`);
  await dash.reload();
  await dash.waitForSelector('[data-testid="inbox-row"]', { timeout: 5000 });
  await expect(dash.locator('[data-testid="inbox-row"]')).toHaveCount(2);

  // Keep the first row, then undo within the 5s window.
  await dash
    .locator('[data-testid="inbox-row"]')
    .first()
    .getByRole("button", { name: /保留/ })
    .click();
  await expect(dash.locator('[data-testid="inbox-row"]')).toHaveCount(1);
  await dash.getByRole("button", { name: "撤销" }).click();
  await expect(dash.locator('[data-testid="inbox-row"]')).toHaveCount(2);

  // Focus mode: K keeps the current item and auto-advances.
  await dash.getByRole("button", { name: "专注处理" }).click();
  await expect(dash.locator('[data-testid="inbox-focus"]')).toBeVisible();
  await dash.keyboard.press("k");
  await expect(dash.locator('[data-testid="inbox-focus"]')).toBeVisible();
  await dash.keyboard.press("k");
  await expect(dash.getByText("队列已清空")).toBeVisible();
});
