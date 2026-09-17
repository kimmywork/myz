import { test, expect, BrowserContext, Page } from "@playwright/test";
import { Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LaunchedExtension,
  launchExtension,
} from "../helpers/launch-extension.js";
import { createStaticServer } from "../helpers/static-server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let server: Server;
let serverUrl: string;
let context: BrowserContext;
let page: Page;
let extensionId: string | null;
let launched: LaunchedExtension;

test.beforeAll(async () => {
  const fixtures = path.join(__dirname, "..", "fixtures");
  const s = createStaticServer(fixtures);
  const listen = await s.listen(0);
  server = listen.server;
  serverUrl = listen.url;

  const extensionPath = path.join(__dirname, "..", "..", "dist");
  launched = await launchExtension(extensionPath);
  context = launched.context;
  page = launched.page;
  extensionId = launched.extensionId;
});

test.afterAll(async () => {
  await context.close();
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

test.beforeEach(async () => {
  await page.goto(`${serverUrl}/myz-test.html`);
  await page.waitForSelector('style[data-myz-annotator-style="1"]', {
    state: "attached",
    timeout: 5000,
  });
  await page.waitForSelector("[data-myz-host='1']", {
    state: "attached",
    timeout: 5000,
  });
});

test("injected page styles declare no variables and leave host tokens alone", async () => {
  const css = await page.$eval(
    'style[data-myz-annotator-style="1"]',
    (el) => el.textContent ?? "",
  );

  expect(css).not.toContain(":root");
  // No custom-property declaration may start a declaration block.
  expect(css).not.toMatch(/[{;]\s*--[a-z][a-z0-9-]*\s*:/);

  const hostToken = await page.evaluate(() => {
    document.documentElement.style.setProperty("--surface", "#123456");
    document.body.style.setProperty("--text", "#654321");
    return {
      surface: getComputedStyle(document.documentElement)
        .getPropertyValue("--surface")
        .trim(),
      text: getComputedStyle(document.body).getPropertyValue("--text").trim(),
    };
  });
  expect(hostToken.surface).toBe("#123456");
  expect(hostToken.text).toBe("#654321");
});

test("shadow host defines the shared tokens", async () => {
  const values = await page.evaluate(() => {
    const host = document.querySelector("[data-myz-host='1']");
    if (!host || !host.shadowRoot) return null;
    const style = host.shadowRoot.querySelector("style");
    const text = style?.textContent ?? "";
    return {
      hasTokens: text.includes("--myz-surface"),
      hasPageRules: text.includes(".myz-highlight--paint"),
    };
  });
  expect(values).not.toBeNull();
  expect(values!.hasTokens).toBe(true);
  expect(values!.hasPageRules).toBe(true);
});

function readOverlay() {
  return page.evaluate(() => {
    const hp = document.querySelector("[data-myz-host='1']");
    const mp = hp?.shadowRoot?.querySelector("[data-myz-mount]") as HTMLElement | null;
    const toolbar = hp?.shadowRoot?.querySelector(
      ".myz-annotator-toolbar",
    ) as HTMLElement | null;
    return {
      surface: mp
        ? getComputedStyle(mp).getPropertyValue("--myz-surface").trim()
        : null,
      toolbarBg: toolbar ? getComputedStyle(toolbar).backgroundColor : null,
    };
  });
}

test("overlay follows theme and scheme while the capture bar stays dark", async () => {
  const ext = await context.newPage();
  const popupUrl = `chrome-extension://${extensionId}/src/popup/popup.html`;
  await ext.goto(popupUrl);

  const setAppearance = (scheme: string, theme: string) =>
    ext.evaluate(
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

  const initial = await readOverlay();
  expect(initial.surface).toBe("#faf9f5"); // paper light
  expect(initial.toolbarBg).toBe("rgb(20, 20, 19)"); // fixed overlay

  await setAppearance("ochre", "dark");
  await page.waitForFunction(
    () => {
      const hp = document.querySelector("[data-myz-host='1']");
      const mp = hp?.shadowRoot?.querySelector("[data-myz-mount]") as HTMLElement | null;
      return (
        mp &&
        getComputedStyle(mp).getPropertyValue("--myz-surface").trim() ===
          "#1f1a14"
      );
    },
    undefined,
    { timeout: 5000 },
  );

  const ochreDark = await readOverlay();
  expect(ochreDark.surface).toBe("#1f1a14"); // ochre dark
  expect(ochreDark.toolbarBg).toBe("rgb(20, 20, 19)");

  await ext.close();
});

test("capture_bar_appearance_matrix", async () => {
  const outDir = path.join(__dirname, "..", "screenshots", "out");
  const ext = await context.newPage();
  await ext.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);

  await page.goto(`${serverUrl}/myz-test.html`);
  const para = page.locator("#para-1");
  const box = await para.boundingBox();
  if (!box) throw new Error("Could not determine paragraph bounding box");
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 10, box.y + 10);
  await page.mouse.up();
  await page.waitForSelector(".myz-annotator-toolbar:not(.myz-hidden)", {
    timeout: 8000,
  });

  for (const scheme of ["paper", "slate", "celadon", "ochre"]) {
    for (const theme of ["light", "dark"]) {
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
      await page.waitForFunction(
        ({ scheme }) => {
          const hp = document.querySelector("[data-myz-host='1']");
          const mp = hp?.shadowRoot?.querySelector(
            "[data-myz-mount]",
          ) as HTMLElement | null;
          return mp?.dataset.scheme === scheme;
        },
        { scheme },
        { timeout: 5000 },
      );
      await page.screenshot({
        path: path.join(outDir, `capture-${scheme}-${theme}.png`),
      });
    }
  }

  await ext.close();
});

test("zen_mode_code_block_keeps_a_full_width_surface", async () => {
  const outDir = path.join(__dirname, "..", "screenshots", "out");
  await page.goto(`${serverUrl}/zen-code.html`);
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.postMessage({ __myz_e2e__: true, type: "toggleZenMode" }, "*");
  });
  await page.waitForSelector("html.myz-zen-enabled", { timeout: 5000 });

  const code = await page.evaluate(() => {
    const pre = document.querySelector("#art pre") as HTMLElement;
    const inner = pre.querySelector("code") as HTMLElement;
    const preStyle = getComputedStyle(pre);
    const codeStyle = getComputedStyle(inner);
    return {
      preBackground: preStyle.backgroundColor,
      preWidth: pre.getBoundingClientRect().width,
      articleWidth: (
        document.querySelector("#art") as HTMLElement
      ).getBoundingClientRect().width,
      codeBackground: codeStyle.backgroundColor,
      codeFont: codeStyle.fontFamily,
    };
  });

  expect(code.preBackground).toBe("rgb(236, 234, 224)");
  expect(code.codeBackground).toBe("rgba(0, 0, 0, 0)");
  expect(code.preWidth).toBeGreaterThan(code.articleWidth * 0.8);
  expect(code.codeFont.toLowerCase()).toContain("mono");

  await page.screenshot({ path: path.join(outDir, "zen-code.png") });
});

test("clicked-highlight_toolbar_is_fixed_dark_while_the_panel_follows_theme", async () => {
  await page.goto(`${serverUrl}/myz-test.html`);
  await page.waitForSelector('style[data-myz-annotator-style="1"]', {
    state: "attached",
    timeout: 5000,
  });

  const para = page.locator("#para-1");
  const box = await para.boundingBox();
  if (!box) throw new Error("no paragraph box");
  await page.mouse.move(box.x + 8, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + Math.min(box.width - 8, 160), box.y + 8);
  await page.mouse.up();
  await page.waitForSelector(".myz-annotator-toolbar:not(.myz-hidden)", {
    timeout: 8000,
  });
  await page.click('.myz-annotator-toolbar button[aria-label="划线"]');
  await page.waitForSelector(".myz-annotator-modal:not(.myz-hidden)", {
    timeout: 8000,
  });
  await page.click(".myz-annotator-modal .myz-btn-primary");
  await page.waitForSelector(".myz-highlight", { timeout: 5000 });

  // Click the highlight: the compact 3-button bar must be fixed dark.
  await page.locator(".myz-highlight").first().click();
  await page.waitForSelector(".myz-inspector--toolbar:not(.myz-hidden)", {
    timeout: 5000,
  });
  const bg = await page.$eval(
    ".myz-inspector--toolbar",
    (el) => getComputedStyle(el).backgroundColor,
  );
  expect(bg).toBe("rgb(20, 20, 19)");
});
