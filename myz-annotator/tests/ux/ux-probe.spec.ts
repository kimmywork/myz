import { test, BrowserContext, Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchExtension } from "../helpers/launch-extension.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outDir = path.join(__dirname, "..", "..", "test-results", "ux");
fs.mkdirSync(outDir, { recursive: true });

const observations: Record<string, unknown> = {};

async function send<T>(
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
  if (!typed?.ok) throw new Error(`${type} failed: ${typed?.error}`);
  return typed.data as T;
}

async function saveClip(page: Page, text: string, tags: string[] = []) {
  return send<{ id: string }>(page, "myz:saveHighlight", {
    url: "https://example.com/ux",
    sourceUrl: "https://example.com/ux",
    title: `Clip ${text}`,
    text,
    html: `<p>${text}</p>`,
    note: "",
    tags,
    hostname: "example.com",
    kind: "clip",
  });
}

async function pendingCount(page: Page): Promise<number> {
  const queue = await send<{ counts: { pending: number } }>(
    page,
    "myz:inboxQueue",
  );
  return queue.counts.pending;
}

function luminance(hex: string): number | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = parseInt(match[1], 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map(
    (channel) => {
      const c = channel / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    },
  );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number | null {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
}

async function token(page: Page, name: string): Promise<string> {
  return page.evaluate(
    (tokenName) =>
      getComputedStyle(document.documentElement)
        .getPropertyValue(tokenName)
        .trim(),
    name,
  );
}

async function boxSize(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  return box ? { w: Math.round(box.width), h: Math.round(box.height) } : null;
}

test("ux dynamic probe", async () => {
  test.setTimeout(150_000);
  const extensionPath = path.join(__dirname, "..", "..", "dist");
  const launched = await launchExtension(extensionPath);
  const context: BrowserContext = launched.context;
  const extensionId = launched.extensionId;
  const dashboardUrl = `chrome-extension://${extensionId}/src/dashboard/index.html`;

  const dialogs: string[] = [];

  const dash = await context.newPage();
  dash.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await dash.goto(dashboardUrl);
  await dash.waitForSelector(".app-shell", { timeout: 10_000 });

  await saveClip(dash, "ux alpha", ["work"]);
  await saveClip(dash, "ux beta");

  await dash.goto(`${dashboardUrl}#/inbox`);
  await dash.reload();
  await dash.waitForSelector('[data-testid="inbox-row"]', { timeout: 10_000 });

  // --- Probe 6: drag multi-select works (interaction sanity) ---
  await dash
    .locator('[data-testid="inbox-row"]', { hasText: "ux beta" })
    .getByRole("checkbox")
    .check();
  await dash
    .locator('[data-testid="inbox-row"]', { hasText: "ux alpha" })
    .getByRole("checkbox")
    .check();
  await dash
    .locator('[data-testid="inbox-row"]', { hasText: "ux alpha" })
    .dragTo(dash.locator('[data-testid="inbox-tag"]', { hasText: "work" }));
  await dash.waitForTimeout(300);
  const records = await send<Array<{ text?: string; tags?: string[] }>>(
    dash,
    "myz:getAllHighlights",
  );
  observations.multiSelectDrag = {
    taggedCount: records.filter((record) =>
      (record.tags || []).includes("work"),
    ).length,
  };

  // --- Probe 1: focus-mode keyboard vs inputs (P0-1) ---
  await dash.getByRole("button", { name: "专注处理" }).click();
  await dash.waitForSelector('[data-testid="inbox-focus"]');
  const pendingBefore = await pendingCount(dash);
  const search = dash.getByPlaceholder("搜索原文、批注、标题、标签、来源");
  await search.click();
  await search.type("a");
  await dash.waitForTimeout(400);
  const pendingAfterA = await pendingCount(dash);
  const searchValueAfterA = await search.inputValue();
  await search.fill("");
  await dash.waitForTimeout(150);
  await search.type("d");
  await dash.waitForTimeout(400);
  const pendingAfterD = await pendingCount(dash);
  await search.fill("");
  observations.keyboardConflict = {
    pendingBefore,
    pendingAfterA,
    searchValueAfterA,
    pendingAfterD,
    actionFiredWhileTyping: pendingAfterA !== pendingBefore,
    deleteConfirmWhileTyping: dialogs.some((message) =>
      message.includes("删除后不可撤销"),
    ),
    note: "typing in the search box while focus mode is on triggers row actions",
  };

  // --- Probe 2: Escape does not exit focus mode ---
  await dash.keyboard.press("Escape");
  await dash.waitForTimeout(150);
  observations.escapeExitsFocusMode = !(await dash
    .locator('[data-testid="inbox-focus"]')
    .isVisible());

  // --- Probe 3: aria-live presence in dashboard ---
  observations.ariaLiveCount = await dash.evaluate(
    () => document.querySelectorAll("[aria-live]").length,
  );

  // --- Probe 4: hit targets ---
  await dash.getByRole("button", { name: "退出专注" }).click();
  await dash.waitForTimeout(150);
  observations.hitTargets = {
    tagRemove: await boxSize(
      dash,
      '[data-testid="inbox-row"] [aria-label^="移除标签"]',
    ),
    tagChip: await boxSize(dash, '[data-testid="inbox-tag"]'),
    rowButton: await boxSize(dash, '[data-testid="inbox-row"] button'),
    navButton: await boxSize(dash, "aside nav button"),
  };

  // --- Probe 5: contrast of muted on surface-2 (light + dark) ---
  const lightMuted = await token(dash, "--myz-muted");
  const lightSurface2 = await token(dash, "--myz-surface-2");
  await dash.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "dark");
    document.body.classList.add("dark");
  });
  const darkMuted = await token(dash, "--myz-muted");
  const darkSurface2 = await token(dash, "--myz-surface-2");
  await dash.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "light");
    document.body.classList.remove("dark");
  });
  observations.contrast = {
    light: {
      muted: lightMuted,
      surface2: lightSurface2,
      ratio: contrast(lightMuted, lightSurface2),
    },
    dark: {
      muted: darkMuted,
      surface2: darkSurface2,
      ratio: contrast(darkMuted, darkSurface2),
    },
  };

  // --- Screenshots ---
  await dash.goto(`${dashboardUrl}#/inbox`);
  await dash.reload();
  await dash.waitForSelector('[data-testid="inbox-row"]', { timeout: 10_000 });
  await dash.screenshot({ path: path.join(outDir, "inbox-light.png") });
  await dash.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "dark");
    document.body.classList.add("dark");
  });
  await dash.screenshot({ path: path.join(outDir, "inbox-dark.png") });
  await dash.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "light");
    document.body.classList.remove("dark");
  });

  await dash.goto(`${dashboardUrl}#/highlights`);
  await dash.reload();
  await dash.waitForSelector(".app-shell", { timeout: 10_000 });
  await dash.screenshot({ path: path.join(outDir, "library-light.png") });

  await dash.goto(`${dashboardUrl}#/settings/sync`);
  await dash.reload();
  await dash.waitForTimeout(500);
  await dash.screenshot({ path: path.join(outDir, "settings-sync-light.png") });

  if (extensionId) {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
    await popup.waitForTimeout(500);
    await popup.screenshot({ path: path.join(outDir, "popup.png") });
  }

  fs.writeFileSync(
    path.join(outDir, "observations.json"),
    JSON.stringify(observations, null, 2),
  );

  console.log("UX_PROBE_OBSERVATIONS " + JSON.stringify(observations));

  await context.close();
});
