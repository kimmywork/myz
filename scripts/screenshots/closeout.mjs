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
 * Output: `screenshots/i10/<phase>/<surface>-<theme>-<width>.png` plus a
 * `manifest.json` per phase (git-ignored). Requires a built extension:
 * `npm run build` first.
 *
 * The manifest is the point: it records which commit each phase was shot from,
 * so two sets can be compared only when they come from one run each. Without
 * it, a mix of images from different builds silently produces a plausible
 * "0.44%" — which is exactly what happened once and cost hours to notice.
 *
 *   node scripts/screenshots/closeout.mjs --compare before after
 *
 * Not part of CI: it depends on a real browser and on fixture data, and the
 * images are judged by a person.
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { extname as pathExtname, join, sep } from "node:path";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
const ALL_SURFACES = ["settings", "assets", "readers", "viewer", "popup", "content"];

/** `--surface readers` narrows the run; repeating it takes several. */
const requested = process.argv
  .map((argument, index, all) => (argument === "--surface" ? all[index + 1] : ""))
  .filter(Boolean);
const SURFACES = requested.length
  ? ALL_SURFACES.filter((surface) => requested.includes(surface))
  : ALL_SURFACES;
for (const surface of requested) {
  if (!ALL_SURFACES.includes(surface)) {
    throw new Error(`unknown surface "${surface}" (have: ${ALL_SURFACES.join(", ")})`);
  }
}

/** Records which build a phase's images came from. Refuses to mix builds. */
const MANIFEST = "manifest.json";

function buildInfo() {
  const git = (args) => execSync(`git ${args}`, { cwd: root }).toString().trim();
  return {
    branch: git("rev-parse --abbrev-ref HEAD"),
    commit: git("rev-parse HEAD"),
    dirty: git("status --porcelain").length > 0,
  };
}

/** PNG dimensions from the IHDR chunk — no image library needed. */
function pngSize(file) {
  const header = readFileSync(file).subarray(0, 24);
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

function pngHash(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function readManifest(dir) {
  try {
    return JSON.parse(readFileSync(resolve(dir, MANIFEST), "utf8"));
  } catch {
    return null;
  }
}

/**
 * Refuses to add images from a different build to an existing phase.
 *
 * `--surface` makes partial runs cheap, and partial runs are how a directory
 * ends up holding images from two commits. Re-shooting one surface after a
 * rebuild is exactly that case, so it is an error rather than a merge.
 */
function assertSameBuild(dir, info) {
  const existing = readManifest(dir);
  if (!existing) return;
  if (existing.source?.commit && existing.source.commit !== info.commit) {
    throw new Error(
      `${dir} already holds images from ${existing.source.commit.slice(0, 7)} ` +
        `(${existing.source.branch}); this build is ${info.commit.slice(0, 7)}. ` +
        `Re-shoot the whole phase, or delete the directory — mixing builds is ` +
        `what makes a before/after comparison lie.`,
    );
  }
}

function writeManifest(dir, images, info) {
  const existing = readManifest(dir);
  const merged = { ...(existing?.images ?? {}) };
  for (const [name, entry] of Object.entries(images)) merged[name] = entry;
  const manifest = {
    version: 1,
    phase: dir.slice(OUT_ROOT.length + 1),
    source: info,
    createdAt: new Date().toISOString(),
    images: merged,
  };
  writeFileSync(resolve(dir, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

/**
 * `--compare <before> <after>`: refuses to compare sets that are not each from
 * one build, and refuses to compare files that changed on disk after the run.
 */
function compare(beforeName, afterName) {
  const beforeDir = resolve(OUT_ROOT, beforeName);
  const afterDir = resolve(OUT_ROOT, afterName);
  const problems = [];
  const manifests = {};
  for (const [label, dir] of [["before", beforeDir], ["after", afterDir]]) {
    const manifest = readManifest(dir);
    if (!manifest) {
      problems.push(`${label}: no ${MANIFEST} in ${dir} — re-shoot that phase`);
      continue;
    }
    const commits = new Set(Object.values(manifest.images).map((i) => i.commit));
    if (commits.size > 1) {
      problems.push(
        `${label}: images come from ${commits.size} commits ` +
          `(${[...commits].map((c) => c.slice(0, 7)).join(", ")}) — mixed set`,
      );
    }
    manifests[label] = manifest;
  }
  if (problems.length) {
    console.error(`✗ refusing to compare:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }

  const before = manifests.before;
  const after = manifests.after;
  const names = Object.keys(before.images).sort();
  const afterNames = new Set(Object.keys(after.images));
  for (const name of names) {
    if (!afterNames.has(name)) problems.push(`${name} is missing from ${afterName}`);
  }
  for (const name of afterNames) {
    if (!before.images[name]) problems.push(`${name} is missing from ${beforeName}`);
  }
  for (const [label, dir, manifest] of [
    ["before", beforeDir, before],
    ["after", afterDir, after],
  ]) {
    for (const [name, entry] of Object.entries(manifest.images)) {
      const file = resolve(dir, name);
      let hash = "";
      try {
        hash = pngHash(file);
      } catch {
        problems.push(`${label}/${name}: recorded but not on disk`);
        continue;
      }
      if (hash !== entry.sha256) {
        problems.push(`${label}/${name}: changed on disk after the run`);
      }
    }
  }
  if (problems.length) {
    console.error(`✗ refusing to compare:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }

  const identical = names.filter(
    (name) => before.images[name].sha256 === after.images[name].sha256,
  );
  const differing = names.filter((name) => !identical.includes(name));
  console.log(
    `before: ${before.source.branch}@${before.source.commit.slice(0, 7)}` +
      `${before.source.dirty ? " (dirty)" : ""}`,
  );
  console.log(
    `after:  ${after.source.branch}@${after.source.commit.slice(0, 7)}` +
      `${after.source.dirty ? " (dirty)" : ""}`,
  );
  console.log(`${identical.length}/${names.length} byte-identical`);
  for (const name of differing) console.log(`  differs: ${name}`);
  console.log(
    "for the differing images, measure with: " +
      "magick compare -metric AE <before>/<name> <after>/<name> null:",
  );
}

const compareIndex = process.argv.indexOf("--compare");
if (compareIndex >= 0) {
  compare(process.argv[compareIndex + 1], process.argv[compareIndex + 2]);
  process.exit(0);
}

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

/**
 * Tiny static server, only so the content script has a real page to run on.
 *
 * It serves the fixture directory and nothing else: the path is resolved and
 * then checked to still be inside `FIXTURES`, so `GET /../../../.env` is a 403
 * rather than a file read. It also binds to loopback only — an ephemeral port
 * is still an open port on every interface, not just this machine.
 */
const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  const file = resolve(FIXTURES, `.${decodeURIComponent(pathname)}`);
  if (file !== FIXTURES && !file.startsWith(FIXTURES + sep)) {
    response.writeHead(403).end("forbidden");
    return;
  }
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
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
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
    // A handler can fail with `{ok: false, error}`; swallowing that would let
    // the run continue and photograph empty pages, which is how a fake
    // "identical" comparison gets made.
    const send = (type, payload) =>
      new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type, payload }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(`${type}: ${chrome.runtime.lastError.message}`));
            return;
          }
          if (!response) {
            reject(new Error(`${type}: no response from the message layer`));
            return;
          }
          if (response.ok === false) {
            reject(new Error(`${type}: ${response.error ?? "failed"}`));
            return;
          }
          resolve(response.data);
        });
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
    if (!Array.isArray(all) || all.length < records.length) {
      throw new Error(
        `seeded ${records.length} records but the store has ${Array.isArray(all) ? all.length : "none"}`,
      );
    }
    const first = all[0];
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

    // Two shortcuts in the reader progress stores, so the 阅读 page has rows.
    // Without this the surface is its empty state, and its before/after images
    // are identical no matter what the row markup does.
    const openDb = (name) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("handles")) {
            db.createObjectStore("handles");
          }
          if (!db.objectStoreNames.contains("progress")) {
            db.createObjectStore("progress", { keyPath: "sourceKey" });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

    const putProgress = async (dbName, value) => {
      const db = await openDb(dbName);
      await new Promise((resolve, reject) => {
        const tx = db.transaction("progress", "readwrite");
        tx.objectStore("progress").put(value);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    };

    const stamp = Date.now();
    await putProgress("myz_pdf_db", {
      sourceKey: "myz-pdf:local:fp-pdf",
      sourceType: "pdf",
      page: 2,
      pages: 9,
      title: "示例文档（PDF）",
      fingerprint: "fp-pdf",
      updatedAt: new Date(stamp).toISOString(),
    });
    const progressCount = async (dbName) => {
      const db = await openDb(dbName);
      const count = await new Promise((resolve, reject) => {
        const tx = db.transaction("progress", "readonly");
        const request = tx.objectStore("progress").count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return count;
    };
    await putProgress("myz_epub_db", {
      sourceKey: "myz-epub:local:fp-epub",
      sourceType: "epub",
      spineIndex: 0,
      progression: 0.1,
      title: "示例文档（EPUB）",
      fingerprint: "fp-epub",
      updatedAt: new Date(stamp - 60_000).toISOString(),
    });

    for (const dbName of ["myz_pdf_db", "myz_epub_db"]) {
      const count = await progressCount(dbName);
      if (count < 1) throw new Error(`no reading progress landed in ${dbName}`);
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
  // Body colour flips before every container has repainted, and a wide layout
  // has more to repaint. Without this the first shot of a theme can catch a
  // light shell around dark panels.
  await page.waitForTimeout(400);
}

async function shoot(page, surface, width, theme) {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(150);
  const file = resolve(OUT_DIR, `${surface}-${theme}-${width}.png`);
  await page.screenshot({ path: file, fullPage: false });
  captured[file] = {
    width: pngSize(file).width,
    height: pngSize(file).height,
    sha256: pngHash(file),
    commit: info.commit,
    at: new Date().toISOString(),
  };
}

const info = buildInfo();
assertSameBuild(OUT_DIR, info);
/** Every image this run produces, keyed by path, for the phase manifest. */
const captured = {};

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

const total = SURFACES.length * THEMES.length * WIDTHS.length;
const manifest = writeManifest(OUT_DIR, captured, info);
console.log(`wrote ${total} images to ${OUT_DIR}`);
console.log(
  `manifest: ${info.branch}@${info.commit.slice(0, 7)}` +
    `${info.dirty ? " (dirty)" : ""}, ${Object.keys(manifest.images).length} images recorded`,
);

