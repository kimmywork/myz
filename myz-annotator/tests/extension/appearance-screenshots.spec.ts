import { test, expect, BrowserContext } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LaunchedExtension,
  launchExtension,
} from "../helpers/launch-extension.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCHEMES = ["paper", "slate", "celadon", "ochre"] as const;
const THEMES = ["light", "dark"] as const;
const OUT_DIR = path.join(__dirname, "..", "screenshots", "out");

let context: BrowserContext;
let extensionId: string | null;
let launched: LaunchedExtension;

test.beforeAll(async () => {
  const extensionPath = path.join(__dirname, "..", "..", "dist");
  launched = await launchExtension(extensionPath);
  context = launched.context;
  extensionId = launched.extensionId;
  if (!extensionId) {
    throw new Error("Could not determine extension id (extensionId is null).");
  }
});

test.afterAll(async () => {
  await context.close();
});

test("capture_dashboard_appearance_matrix", async () => {
  const dash = await context.newPage();
  await dash.setViewportSize({ width: 1440, height: 1000 });
  const dashboardUrl = `chrome-extension://${extensionId}/src/dashboard/index.html#/highlights`;
  await dash.goto(dashboardUrl);
  await dash.waitForSelector(".app-shell", { timeout: 5000 });

  await dash.evaluate(async () => {
    const records = [
      {
        kind: "clip",
        text: "一读就是半小时以上，长文用衬线体、纸色底、宽行距，界面退到后面。",
        note: "摘自设计系统场景说明。",
        tags: ["阅读", "排版"],
      },
      {
        kind: "highlight",
        text: "原文不属于我们：网页和 PDF 的排版由对方决定，我们只叠加痕迹。",
        note: "",
        tags: ["原则"],
      },
    ];
    for (const record of records) {
      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            type: "myz:saveHighlight",
            payload: {
              url: "https://example.com/reading/long-form",
              sourceUrl: "https://example.com/reading/long-form",
              title: "长文阅读与标注",
              hostname: "example.com",
              ...record,
            },
          },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve(response);
          },
        );
      });
    }
  });

  for (const scheme of SCHEMES) {
    for (const theme of THEMES) {
      await dash.evaluate(
        async ({ scheme, theme }) => {
          await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
              { type: "myz:updateSettings", payload: { colorScheme: scheme } },
              (response) => {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                  return;
                }
                resolve(response);
              },
            );
          });
          await new Promise<void>((resolve) =>
            chrome.storage.local.set({ "myz:theme": theme }, () => resolve()),
          );
        },
        { scheme, theme },
      );

      await dash.reload();
      await dash.waitForSelector(".app-shell", { timeout: 5000 });
      await dash.waitForSelector("article[data-id]", { timeout: 5000 });
      await dash.waitForFunction(
        ({ scheme, theme }) =>
          document.documentElement.dataset.scheme === scheme &&
          document.documentElement.dataset.theme === theme,
        { scheme, theme },
        { timeout: 5000 },
      );
      // Theme/scheme are applied after JS boot, so color transitions may still
      // be interpolating. Freeze them so the artifact shows the settled state.
      await dash.addStyleTag({
        content: "*{transition:none!important;animation:none!important}",
      });
      await dash.waitForTimeout(50);

      const file = path.join(OUT_DIR, `dashboard-${scheme}-${theme}.png`);
      await dash.screenshot({ path: file, fullPage: true });
      expect(await dash.evaluate(() => document.documentElement.dataset.scheme)).toBe(
        scheme,
      );
    }
  }

  await dash.close();
});

test("capture_popup_appearance_matrix", async () => {
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 360, height: 640 });
  const popupUrl = `chrome-extension://${extensionId}/src/popup/popup.html`;
  await popup.goto(popupUrl);
  await popup.waitForSelector(".popup-header", { timeout: 5000 });

  for (const scheme of SCHEMES) {
    for (const theme of THEMES) {
      await popup.evaluate(
        async ({ scheme, theme }) => {
          await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
              { type: "myz:updateSettings", payload: { colorScheme: scheme } },
              (response) => {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                  return;
                }
                resolve(response);
              },
            );
          });
          await new Promise<void>((resolve) =>
            chrome.storage.local.set({ "myz:theme": theme }, () => resolve()),
          );
        },
        { scheme, theme },
      );

      await popup.reload();
      await popup.waitForSelector(".popup-header", { timeout: 5000 });
      await popup.waitForFunction(
        ({ scheme, theme }) =>
          document.documentElement.dataset.scheme === scheme &&
          document.documentElement.dataset.theme === theme,
        { scheme, theme },
        { timeout: 5000 },
      );
      await popup.addStyleTag({
        content: "*{transition:none!important;animation:none!important}",
      });
      await popup.waitForTimeout(50);

      const file = path.join(OUT_DIR, `popup-${scheme}-${theme}.png`);
      await popup.screenshot({ path: file });
    }
  }

  await popup.close();
});
