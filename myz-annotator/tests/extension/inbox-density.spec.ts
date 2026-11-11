import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { setupDashboardHarness } from "../helpers/dashboard-harness.js";
import { dirnameFromImportMeta } from "../helpers/runtime.js";

const __dirname = dirnameFromImportMeta(import.meta.url);
const OUT_DIR = path.join(__dirname, "..", "screenshots", "out", "i3-density");
const PREFIX = process.env.I3_SHOT_PREFIX ?? "after";

const harness = setupDashboardHarness();

const HOSTS = ["sspai.com", "mp.weixin.qq.com", "github.com", "zhihu.com"];
const TAGS = [["阅读"], ["阅读", "待处理"], [], ["设计", "灵感"]];

function seedRecords(count: number) {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => {
    const url = `${harness.serverUrl()}/myz-test.html#${i}`;
    return {
      id: `i3-${i}-${now}`,
      url,
      sourceUrl: url,
      title: `第 ${i + 1} 条记录：一篇关于本地优先应用的笔记`,
      text:
        i % 3 === 0
          ? `第 ${i + 1} 条：这是一段用来测试单行截断的较长正文，长度要超过一行才能看出省略号是否正确生效。`
          : `第 ${i + 1} 条摘录正文。`,
      html: `<p>第 ${i + 1} 条摘录正文。</p>`,
      note: i % 2 === 0 ? `批注 ${i + 1}` : "",
      tags: TAGS[i % TAGS.length],
      hostname: HOSTS[i % HOSTS.length],
      kind: i % 4 === 0 ? "clip" : "highlight",
      createdAt: new Date(now - i * 60000).toISOString(),
    };
  });
}

type SeedRecord = ReturnType<typeof seedRecords>[number];

/** New clips enter the Inbox as pending; import alone marks them as kept. */
async function saveSeed(
  dash: import("@playwright/test").Page,
  record: SeedRecord,
) {
  await dash.evaluate(
    (payload) =>
      new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: "myz:saveHighlight", payload },
          (resp) => {
            if (chrome.runtime.lastError) {
              return reject(new Error(chrome.runtime.lastError.message));
            }
            resolve(resp);
          },
        );
      }),
    {
      url: record.url,
      sourceUrl: record.sourceUrl,
      title: record.title,
      text: record.text,
      html: record.html,
      note: record.note,
      tags: record.tags,
      hostname: record.hostname,
      kind: record.kind,
    },
  );
}

async function density(dash: import("@playwright/test").Page) {
  return dash.evaluate(() => {
    const list = document.querySelector('[data-testid="inbox-list"]');
    if (!list) return null;
    const area = list.getBoundingClientRect();
    // Rows only count as visible inside the shell's scrolling viewport, not
    // inside the full (taller than the screen) list container.
    const scroller = document.querySelector(".myz-workspace__body");
    const scrollerBox = scroller?.getBoundingClientRect();
    const top = Math.max(area.top, scrollerBox?.top ?? 0);
    const bottom = Math.min(
      area.bottom,
      scrollerBox?.bottom ?? window.innerHeight,
    );
    const rows = Array.from(list.querySelectorAll('[data-testid="inbox-row"]'));
    const fully = rows.filter((row) => {
      const box = row.getBoundingClientRect();
      return box.top >= top && box.bottom <= bottom;
    });
    const first = rows[0]?.getBoundingClientRect();
    return {
      listHeight: Math.round(bottom - top),
      total: rows.length,
      fullyVisible: fully.length,
      rowHeight: first ? Math.round(first.height) : 0,
      flushRows: rows.every((row) => row.classList.contains("myz-list-row")),
    };
  });
}

/**
 * I3 acceptance evidence: 800px-tall list area, before vs after rows.
 * Run with `I3_SHOT_PREFIX=before npx playwright test ...` on the old code.
 */
test("capture_inbox_density", async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const dash = await harness.open("/inbox");
  for (const record of seedRecords(20)) {
    await saveSeed(dash, record);
  }
  await dash.reload();
  await dash.waitForSelector('[data-testid="inbox-row"]', { timeout: 10000 });

  await dash.setViewportSize({ width: 1440, height: 1100 });
  await dash.waitForTimeout(200);
  const light = await density(dash);
  console.log(`I3_DENSITY light ${PREFIX}`, JSON.stringify(light));
  expect(light).not.toBeNull();
  // Acceptance: 800px of list area fits >= 14 rows (800 / 56 = 14).
  expect(light!.rowHeight).toBe(56);
  expect(light!.flushRows).toBe(true);
  expect(light!.listHeight).toBeGreaterThanOrEqual(800);
  expect(light!.fullyVisible).toBeGreaterThanOrEqual(14);
  await dash.screenshot({
    path: path.join(OUT_DIR, `i3-inbox-${PREFIX}-paper.png`),
  });

  // Detail panel evidence: click the first row.
  await dash.locator('[data-testid="inbox-row"]').first().click();
  await dash.waitForSelector('[data-testid="inbox-detail"]', {
    timeout: 5000,
  });
  await dash.waitForTimeout(150);
  await dash.screenshot({
    path: path.join(OUT_DIR, `i3-inbox-${PREFIX}-panel.png`),
  });
  await dash.keyboard.press("Escape");
  await dash.waitForSelector('[data-testid="inbox-detail"]', {
    state: "detached",
    timeout: 5000,
  });

  await dash.locator("button.myz-workspace__theme").click();
  await dash.getByRole("option", { name: "暗色" }).click();
  await dash.waitForTimeout(200);
  const dark = await density(dash);
  console.log(`I3_DENSITY dark ${PREFIX}`, JSON.stringify(dark));
  await dash.screenshot({
    path: path.join(OUT_DIR, `i3-inbox-${PREFIX}-dark.png`),
  });

  // Library list view: same flush rows as the Inbox.
  await dash.locator('[data-testid="rail-highlights"]').click();
  await dash.waitForSelector("article[data-id]", { timeout: 10000 });
  await dash.getByRole("button", { name: "列表" }).click();
  await dash.waitForTimeout(200);
  const listRows = await dash.$$eval(".myz-list-row", (rows) => {
    const heights = rows.map((row) => row.getBoundingClientRect().height);
    return {
      count: rows.length,
      height: heights.length ? Math.round(heights[0]) : 0,
    };
  });
  console.log(`I3_LIBRARY ${PREFIX}`, JSON.stringify(listRows));
  expect(listRows.height).toBe(56);
  expect(listRows.count).toBe(20);
  await dash.screenshot({
    path: path.join(OUT_DIR, `i3-library-${PREFIX}-list.png`),
  });
});
