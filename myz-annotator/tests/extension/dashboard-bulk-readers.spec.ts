import { test, expect } from "@playwright/test";
import { send, setupDashboardHarness } from "../helpers/dashboard-harness.js";

const harness = setupDashboardHarness();

test("bulk_import_and_search_filters", async () => {
  const dash = await harness.open();
  const canonicalBase = `${harness.serverUrl()}/myz-test.html`;
  const hosts = ["example.com", "alpha.test", "beta.example", "site.local"];
  const tagsPool = ["red", "blue", "green", "urgent", "todo"];
  const total = 120;
  const records = [];
  const now = Date.now();
  for (let i = 0; i < total; i++) {
    const tags = [
      tagsPool[i % tagsPool.length],
      tagsPool[(i + 2) % tagsPool.length],
    ];
    const text =
      i % 7 === 0 ? `record ${i} filter-target` : `record ${i} normal`;
    records.push({
      id: `bulk-${i}-${Date.now()}`,
      url: `${canonicalBase}#${i}`,
      sourceUrl: `${canonicalBase}#${i}`,
      title: `Bulk ${i}`,
      text,
      html: `<p>${text}</p>`,
      note: `note ${i}`,
      tags,
      hostname: hosts[i % hosts.length],
      kind: "clip",
      createdAt: new Date(now - i * 60000).toISOString(),
    });
  }
  await send(dash, "myz:importHighlights", { records, strategy: "replace" });

  const allData = await send<Array<unknown>>(dash, "myz:getAllHighlights");
  expect(allData.length).toBeGreaterThanOrEqual(total);

  await dash.reload();
  await dash.waitForSelector("article[data-id]", { timeout: 10000 });

  const searchInput = 'input[placeholder="搜索/标签/网站"]';
  await dash.fill(searchInput, "filter-target");
  await dash.waitForTimeout(500);
  expect(
    await dash.$$eval("article[data-id]", (els) => els.length),
  ).toBeGreaterThan(0);

  await dash.fill(searchInput, "");
  await dash.waitForTimeout(200);
  await dash.fill(searchInput, `site:${hosts[1]}`);
  await dash.waitForTimeout(500);
  expect(
    await dash.$$eval("article[data-id]", (els) => els.length),
  ).toBeGreaterThan(0);
});

test("infinite_scroll_loads_more", async () => {
  const dash = await harness.open();
  const canonicalBase = `${harness.serverUrl()}/myz-test.html`;
  const total = 60;
  const records = [];
  for (let i = 0; i < total; i++) {
    records.push({
      id: `inf-${i}-${Date.now()}`,
      url: `${canonicalBase}#inf-${i}`,
      sourceUrl: `${canonicalBase}#inf-${i}`,
      title: `Inf ${i}`,
      text: `infinite ${i}`,
      html: `<p>infinite ${i}</p>`,
      note: `note ${i}`,
      tags: [],
      hostname: `host${i % 4}.local`,
      kind: "clip",
      createdAt: new Date(Date.now() - i * 1000).toISOString(),
    });
  }
  await send(dash, "myz:importHighlights", {
    records,
    strategy: "overwrite",
  });

  await dash.reload();
  await dash.waitForSelector("article[data-id]", { timeout: 10000 });
  const initialCount = await dash.$$eval(
    "article[data-id]",
    (els) => els.length,
  );

  const sentinel = await dash.$('.scroll-sentinel[data-role="sentinel"]');
  if (!sentinel) {
    expect(initialCount).toBeGreaterThanOrEqual(total);
    return;
  }

  await dash.evaluate(() => {
    const root = document.querySelector(".main");
    const sentinel = document.querySelector(
      '.scroll-sentinel[data-role="sentinel"]',
    );
    if (sentinel && root) {
      sentinel.scrollIntoView({ block: "end" });
      root.scrollTop = root.scrollHeight;
    }
  });
  await dash.waitForFunction(
    (prev) => document.querySelectorAll("article[data-id]").length > prev,
    initialCount,
    { timeout: 5000 },
  );
  expect(
    await dash.$$eval("article[data-id]", (els) => els.length),
  ).toBeGreaterThan(initialCount);
});

test("readers_page_lists_recent_local_documents", async () => {
  const dash = await harness.open();
  await dash.evaluate(async () => {
    const open = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("myz_epub_db", 1);
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
    const db = await open;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("progress", "readwrite");
      tx.objectStore("progress").put({
        sourceKey: "myz-epub:seed-fingerprint",
        sourceType: "epub",
        spineIndex: 2,
        progression: 0.4,
        title: "Seed EPUB",
        fingerprint: "seed-fingerprint",
        updatedAt: new Date().toISOString(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });

  await dash.reload();
  await dash.evaluate(() => {
    window.location.hash = "#/readers";
  });
  await expect(dash.getByRole("heading", { name: "阅读" })).toBeVisible();
  const item = dash.locator(".settings__list-item", { hasText: "Seed EPUB" });
  await expect(item).toBeVisible();
  await expect(item.getByText("第 3 章")).toBeVisible();
  await expect(item.getByRole("button", { name: "继续阅读" })).toBeVisible();
});

test("epub_record_shows_chapter_and_open_action", async () => {
  const dash = await harness.open();
  const id = `epub-${Date.now()}`;
  const source = `myz-epub:demo-${Date.now()}`;
  await send(dash, "myz:saveHighlight", {
    id,
    url: source,
    sourceUrl: source,
    title: "示例 EPUB",
    text: "epub snippet",
    html: "<p>epub snippet</p>",
    note: "",
    tags: [],
    hostname: "",
    kind: "highlight",
    color: "#b58900",
    style: "paint",
    epubLocator: { spineIndex: 2, progression: 0, textQuote: "epub snippet" },
  });

  await dash.reload();
  await dash.waitForSelector(".app-shell", { timeout: 5000 });
  const card = dash.locator(`article[data-id="${id}"]`);
  await expect(card).toBeVisible({ timeout: 8000 });
  await expect(card).toContainText("第 3 章");
  await expect(card.locator('button[title="在阅读器中打开"]')).toHaveCount(1);
});
