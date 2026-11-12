#!/usr/bin/env node
/*
 * Visual closeout screenshots for I10.
 *
 * Captures each surface in both themes at four breakpoints, so "is this one
 * product?" can be judged from the images instead of from the diff. The
 * acceptance list asks for before *and* after, side by side, so the phase is an
 * argument and both runs write to the same layout:
 *
 *   node scripts/screenshots/closeout.mjs --phase before
 *   node scripts/screenshots/closeout.mjs --phase after
 *
 * Output: `screenshots/i10/<phase>/<surface>-<theme>-<width>.png`
 * (git-ignored). Requires a built extension: `npm run build` first.
 *
 * Not part of CI: it depends on a real browser and on fixture data, and the
 * images are judged by a person.
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { extname as pathExtname, join } from "node:path";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.env.MYZ_ROOT
  ? resolve(process.env.MYZ_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EXTENSION = resolve(root, "myz-annotator/dist");
const OUT_ROOT = resolve(root, "screenshots/i10");

const phaseIndex = process.argv.indexOf("--phase");
const phase = phaseIndex >= 0 ? process.argv[phaseIndex + 1] : "before";

/** The contract's four breakpoints, and the themes that must both work. */
const WIDTHS = [1440, 1280, 900, 640];
const THEMES = ["light", "dark"];

/** Surfaces the acceptance list names. */
const SURFACES = ["settings", "assets", "readers", "viewer", "popup", "content"];

const OUT_DIR = resolve(OUT_ROOT, phase);
mkdirSync(OUT_DIR, { recursive: true });

const FIXTURES = resolve(root, "myz-annotator/tests/fixtures");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

/** Tiny static server, only so the content script has a real page to run on. */
const server = createServer((request, response) => {
  const file = resolve(FIXTURES, `.${request.url ?? "/"}`.split("?")[0]);
  try {
    const body = readFileSync(file);
    response.writeHead(200, {
      "content-type": MIME[pathExtname(file)] ?? "application/octet-stream",
    });
    response.end(body);
  } catch {
    response.writeHead(404).end("not found");
  }
});
await new Promise((resolve) => server.listen(0, resolve));
const fixtureUrl = `http://127.0.0.1:${server.address().port}`;

const userDataDir = mkdtempSync(resolve(tmpdir(), "myz-shots-"));
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: true,
  channel: "chromium",
  args: [
    `--disable-extensions-except=${EXTENSION}`,
    `--load-extension=${EXTENSION}`,
  ],
  viewport: { width: 1440, height: 900 },
});

await new Promise((resolve) => setTimeout(resolve, 800));

/** Finds the extension id by asking the browser for its targets. */
async function extensionId() {
  const page = context.pages()[0] ?? (await context.newPage());
  const client = await context.newCDPSession(page);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { targetInfos } = await client.send("Target.getTargets");
    for (const target of targetInfos) {
      const match = /^chrome-extension:\/\/([^/]+)\//.exec(target.url ?? "");
      if (match) return match[1];
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("extension id not found");
}

const id = await extensionId();
const base = `chrome-extension://${id}`;
const dashboard = (hash) => `${base}/src/dashboard/index.html#${hash}`;

/** Seeds records, captures and reading progress so the pages are not empty. */
async function seed(page) {
  await page.evaluate(async () => {
    const send = (type, payload) =>
      new Promise((resolve) => {
        chrome.runtime.sendMessage({ type, payload }, (response) =>
          resolve(response?.data),
        );
      });

    const now = Date.now();
    const records = [
      {
        kind: "clip",
        text: "长文用衬线体、纸色底、宽行距，界面退到后面。",
        note: "摘自设计系统场景说明。",
        tags: ["阅读", "排版"],
      },
      {
        kind: "highlight",
        text: "原文不属于我们：网页和 PDF 的排版由对方决定，我们只叠加痕迹。",
        note: "",
        tags: ["设计"],
      },
      {
        kind: "clip",
        text: "一个页面里三级层级要一眼分得出来，说明文字和正文一样大就是没分。",
        note: "视觉收口的判据之一。",
        tags: [],
      },
      {
        kind: "highlight",
        text: "宁可少几条定位，也不能让高亮挂错地方。",
        note: "",
        tags: ["快照"],
      },
    ];

    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      const url = `https://example.com/article/${index}`;
      await send("myz:saveHighlight", {
        ...record,
        url,
        sourceUrl: url,
        title: `示例文章 ${index + 1}`,
        hostname: "example.com",
        html: `<p>${record.text}</p>`,
        createdAt: new Date(now - index * 3600_000).toISOString(),
      });
    }

    const all = await send("myz:getAllHighlights", undefined);
    const first = Array.isArray(all) ? all[0] : null;
    if (first) {
      // One record with a saved snapshot, so the viewer's second view renders.
      await send("myz:saveSnapshot", {
        recordId: first.id,
        url: first.url,
        title: first.title,
        html: `<article><p>${first.text}</p><p>快照正文的第二段，用来观察回看时的排版。</p></article>`,
        css: "",
      });
    }
  });
}

/**
 * Switches the theme the way the app itself stores it.
 *
 * Light/dark lives in `chrome.storage.local` under `myz:theme` (the
 * `colorScheme` setting is the paper/slate palette, a different axis). The app
 * watches that key and repaints, so the wait is on `dataset.theme` rather than
 * a reload.
 */
async function setTheme(page, theme) {
  await page.evaluate(async (value) => {
    await new Promise((resolve) => {
      chrome.storage.local.set({ "myz:theme": value }, () => resolve(undefined));
    });
  }, theme);
  await page.waitForFunction(
    (value) => document.documentElement.dataset.theme === value,
    theme,
    { timeout: 5000 },
  );
  // The attribute flips before the palette has painted: without this the first
  // shot of a theme can catch a half-applied page (light shell, dark panels).
  await page.waitForFunction(
    (value) => {
      const bg = getComputedStyle(document.body).backgroundColor;
      if (!bg || bg === "rgba(0, 0, 0, 0)") return false;
      const dark = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(bg);
      if (!dark) return true;
      const luminance = (Number(dark[1]) + Number(dark[2]) + Number(dark[3])) / 3;
      return value === "dark" ? luminance < 120 : luminance > 120;
    },
    theme,
    { timeout: 5000 },
  );
}

async function shoot(page, surface, width, theme) {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(150);
  await page.screenshot({
    path: resolve(OUT_DIR, `${surface}-${theme}-${width}.png`),
    fullPage: false,
  });
}

const dash = await context.newPage();
await dash.goto(dashboard("/highlights"));
await dash.waitForSelector(".app-shell", { timeout: 15_000 });
await seed(dash);
await dash.reload();
await dash.waitForSelector(".app-shell", { timeout: 15_000 });

const records = await dash.evaluate(async () => {
  const response = await new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "myz:getAllHighlights", payload: undefined },
      (value) => resolve(value?.data),
    );
  });
  return Array.isArray(response) ? response.map((record) => record.id) : [];
});

const viewerId = records[0] ?? "";

for (const theme of THEMES) {
  for (const surface of SURFACES) {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });

    if (surface === "popup") {
      await page.goto(`${base}/src/popup/popup.html`);
      await page.waitForSelector("body", { timeout: 10_000 });
      await setTheme(page, theme);
      for (const width of WIDTHS) await shoot(page, surface, width, theme);
      await page.close();
      continue;
    }

    if (surface === "content") {
      // A real page, so the content script injects the capture toolbar; the
      // selection is dragged like a user would, then the toolbar is captured.
      await page.goto(`${fixtureUrl}/myz-test.html`);
      const para = page.locator("#para-1");
      await para.waitFor({ timeout: 10_000 });
      const box = await para.boundingBox();
      if (!box) throw new Error("no bounding box for the fixture paragraph");
      await page.mouse.move(box.x + 10, box.y + 10);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width - 10, box.y + 10);
      await page.mouse.up();
      await page.waitForSelector(".myz-annotator-toolbar:not(.myz-hidden)", {
        timeout: 10_000,
      });
      // The overlay is fixed-dark by design (spec §3.1) and this is a host
      // page, so there is no extension context to switch themes with. Both
      // themes are still captured to show the overlay does not follow them.
      for (const width of WIDTHS) await shoot(page, surface, width, theme);
      await page.close();
      continue;
    }

    switch (surface) {
      case "settings":
        await page.goto(dashboard("/settings/highlight/preferences"));
        break;
      case "assets":
        await page.goto(dashboard("/assets"));
        break;
      case "readers":
        await page.goto(dashboard("/readers"));
        break;
      case "viewer":
        await page.goto(dashboard(`/highlights/${viewerId}`));
        break;
      default:
        break;
    }
    await page.waitForSelector(".app-shell", { timeout: 15_000 });
    await setTheme(page, theme);
    for (const width of WIDTHS) await shoot(page, surface, width, theme);
    await page.close();
  }
}

await context.close();
server.close();
rmSync(userDataDir, { recursive: true, force: true });

console.log(`wrote ${SURFACES.length * THEMES.length * WIDTHS.length} images to ${OUT_DIR}`);

