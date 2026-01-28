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
let launched;

test.beforeAll(async () => {
  const fixtures = path.join(__dirname, "..", "fixtures");
  const s = createStaticServer(fixtures);
  const listen = await s.listen(0);
  server = listen.server;
  serverUrl = listen.url;

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
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

test("dashboard_lists_and_deletes_highlight_and_exports", async () => {
  // Open dashboard page in extension context
  const dashboardUrl = `chrome-extension://${extensionId}/src/dashboard/index.html`;
  const dash = await context.newPage();
  await dash.goto(dashboardUrl);
  await dash.waitForSelector(".app-shell", { timeout: 5000 });

  // Save a clip via runtime API (background handler)
  const canonical = `${serverUrl}/myz-test.html`;
  const payload = {
    url: canonical,
    sourceUrl: canonical,
    title: "Dashboard Test Page",
    text: "dashboard snippet",
    html: "<p>dashboard snippet</p>",
    note: "note",
    tags: [],
    hostname: new URL(canonical).hostname,
    kind: "clip",
  };

  const saved = await dash.evaluate<{ ok: boolean; data?: { id?: string } }>(
    async (p) => {
      return await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: "myz:saveHighlight", payload: p },
          (resp) => {
            if (chrome.runtime.lastError)
              return reject(new Error(chrome.runtime.lastError.message));
            resolve(resp);
          },
        );
      });
    },
    payload,
  );

  expect(saved && saved.ok).toBeTruthy();
  const savedId =
    saved?.data?.id ||
    saved?.data?.id ||
    (saved && saved.data && saved.data.id);
  null;
  // Reload dashboard to ensure it fetches latest highlights
  await dash.reload();

  // Wait for card representing the saved record
  await dash.waitForSelector(`article[data-id]`, { timeout: 5000 });
  // Find the article with our saved id if present
  const cardSelector = savedId
    ? `article[data-id="${savedId}"]`
    : "article.card";
  const card = await dash.$(cardSelector);
  expect(card).toBeTruthy();

  // Delete the highlight via the card delete button
  const deleteBtn = await card?.$('button[data-action="delete"]');
  expect(deleteBtn).toBeTruthy();
  await deleteBtn?.click();

  // Ensure the card is removed
  await dash.waitForSelector(cardSelector, {
    state: "detached",
    timeout: 5000,
  });

  // Verify export no longer contains the deleted snippet
  const exportResult = await dash.evaluate<{
    ok: boolean;
    data?: { markdown?: string };
  }>(() => {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "myz:export" }, (resp) => {
        if (chrome.runtime.lastError)
          return reject(new Error(chrome.runtime.lastError.message));
        resolve(resp);
      });
    });
  });

  expect(exportResult && exportResult.ok).toBeTruthy();
  const markdown = exportResult?.data?.markdown || "";
  expect(markdown).not.toContain("dashboard snippet");
});

test("dashboard_edit_downgrade_and_import_flows", async () => {
  const dashboardUrl = `chrome-extension://${extensionId}/src/dashboard/index.html`;
  const dash = await context.newPage();
  await dash.goto(dashboardUrl);
  await dash.waitForSelector(".app-shell", { timeout: 5000 });

  // 1) Edit flow: create a clip, open modal via Edit, change note and save
  const canonical = `${serverUrl}/myz-test.html`;
  const clipPayload = {
    url: canonical,
    sourceUrl: canonical,
    title: "Edit Test",
    text: "edit snippet",
    html: "<p>edit snippet</p>",
    note: "original note",
    tags: [],
    hostname: new URL(canonical).hostname,
    kind: "clip",
  };
  const savedClip = await dash.evaluate<{
    ok: boolean;
    data?: { id?: string };
  }>(async (p) => {
    return await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: "myz:saveHighlight", payload: p },
        (resp) => {
          if (chrome.runtime.lastError)
            return reject(new Error(chrome.runtime.lastError.message));
          resolve(resp);
        },
      );
    });
  }, clipPayload);
  expect(savedClip && savedClip.ok).toBeTruthy();
  const clipId = savedClip?.data?.id || null;

  await dash.reload();
  await dash.waitForSelector(`article[data-id]`, { timeout: 5000 });
  const clipSelector = clipId ? `article[data-id="${clipId}"]` : "article.card";

  // Click the 编辑 button inside the card to open modal in edit mode
  await dash.evaluate((sel) => {
    const card = document.querySelector(sel);
    if (!card) throw new Error("card not found");
    const btns = Array.from(card.querySelectorAll("button"));
    const edit = btns.find(
      (b) => b.textContent && b.textContent.trim() === "编辑",
    );
    if (!edit) throw new Error("edit button not found");
    edit.click();
  }, clipSelector);

  // Wait for modal and edit note
  await dash.waitForSelector("#record-modal", { timeout: 5000 });
  await dash.fill('[data-testid="modal-note-input"]', "edited note via test");
  await dash.click('[data-testid="modal-save-button"]');
  // Wait for modal to close
  await dash.waitForSelector("#record-modal", {
    state: "detached",
    timeout: 5000,
  });

  // Reload and assert note updated in card
  await dash.reload();
  await dash.waitForSelector(clipSelector, { timeout: 5000 });
  const noteText = await dash.$eval(
    `${clipSelector} [data-testid="card-note"]`,
    (el) => el.textContent || "",
  );
  expect(noteText).toContain("edited note via test");

  // 2) Downgrade flow: create a highlight (kind=highlight) then downgrade
  const highlightPayload = {
    url: canonical,
    sourceUrl: canonical,
    title: "Downgrade Test",
    text: "downgrade snippet",
    html: "<p>downgrade snippet</p>",
    note: "",
    tags: [],
    hostname: new URL(canonical).hostname,
    kind: "highlight",
    color: "#fde68a",
    style: "paint",
  };
  const savedHl = await dash.evaluate<{ ok: boolean; data?: { id?: string } }>(
    async (p) => {
      return await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: "myz:saveHighlight", payload: p },
          (resp) => {
            if (chrome.runtime.lastError)
              return reject(new Error(chrome.runtime.lastError.message));
            resolve(resp);
          },
        );
      });
    },
    highlightPayload,
  );
  expect(savedHl && savedHl.ok).toBeTruthy();
  const hlId = savedHl?.data?.id || null;
  await dash.reload();
  const hlSelector = hlId ? `article[data-id="${hlId}"]` : "article.card";
  await dash.waitForSelector(hlSelector, { timeout: 5000 });

  // Click the 降级为保存 button
  await dash.evaluate((sel) => {
    const card = document.querySelector(sel);
    if (!card) throw new Error("highlight card not found");
    const btns = Array.from(card.querySelectorAll("button"));
    const down = btns.find(
      (b) => b.textContent && b.textContent.trim() === "降级",
    );
    if (!down) throw new Error("downgrade button not found");
    down.click();
  }, hlSelector);

  // Wait a bit and assert the article data-kind becomes clip
  await dash.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      return el && el.getAttribute("data-kind") === "clip";
    },
    hlSelector,
    { timeout: 5000 },
  );

  // 3) Import flow: call import handler with a record payload
  const importRecord = [
    {
      id: `import-${Date.now()}`,
      url: canonical,
      sourceUrl: canonical,
      title: "Import Test",
      text: "imported snippet",
      html: "<p>imported snippet</p>",
      note: "",
      tags: [],
      hostname: new URL(canonical).hostname,
      kind: "clip",
      createdAt: new Date().toISOString(),
    },
  ];

  const importResult = await dash.evaluate<{ ok: boolean }>(async (records) => {
    return await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "myz:importHighlights",
          payload: { records, strategy: "replace" },
        },
        (resp) => {
          if (chrome.runtime.lastError)
            return reject(new Error(chrome.runtime.lastError.message));
          resolve(resp);
        },
      );
    });
  }, importRecord);
  expect(importResult && importResult.ok).toBeTruthy();

  await dash.reload();
  // Verify imported item appears
  await dash.waitForSelector(`article[data-id="${importRecord[0].id}"]`, {
    timeout: 5000,
  });
});

test("modal_tag_and_color_edit_checks", async () => {
  const dashboardUrl = `chrome-extension://${extensionId}/src/dashboard/index.html`;
  const dash = await context.newPage();
  await dash.goto(dashboardUrl);
  await dash.waitForSelector(".app-shell", { timeout: 5000 });

  const canonical = `${serverUrl}/myz-test.html`;
  const hlPayload = {
    url: canonical,
    sourceUrl: canonical,
    title: "Modal Edit Test",
    text: "modal snippet",
    html: "<p>modal snippet</p>",
    note: "note before edit",
    tags: ["initial"],
    hostname: new URL(canonical).hostname,
    kind: "highlight",
    color: "#00ff00",
    style: "paint",
  };

  const saved = await dash.evaluate<{ ok: boolean; data?: { id?: string } }>(
    async (p) => {
      return await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: "myz:saveHighlight", payload: p },
          (resp) => {
            if (chrome.runtime.lastError)
              return reject(new Error(chrome.runtime.lastError.message));
            resolve(resp);
          },
        );
      });
    },
    hlPayload,
  );
  expect(saved && saved.ok).toBeTruthy();
  const recId = saved?.data?.id || null;

  await dash.reload();
  await dash.waitForSelector(`article[data-id]`, { timeout: 5000 });
  const selector = recId ? `article[data-id="${recId}"]` : "article.card";

  // Open modal in edit mode via 编辑 button
  await dash.evaluate((sel) => {
    const card = document.querySelector(sel);
    if (!card) throw new Error("card not found");
    const btns = Array.from(card.querySelectorAll("button"));
    const edit = btns.find(
      (b) => b.textContent && b.textContent.trim() === "编辑",
    );
    if (!edit) throw new Error("edit button not found");
    edit.click();
  }, selector);

  await dash.waitForSelector("#record-modal", { timeout: 5000 });

  // Add a new tag via TagInput inside modal
  const tagInputSel = '#record-modal [data-testid="tag-input-field"]';
  await dash.waitForSelector(tagInputSel, { timeout: 3000 });
  await dash.focus(tagInputSel);
  await dash.type(tagInputSel, "from-test");
  // commit with Enter
  await dash.keyboard.press("Enter");

  // Verify the new tag chip appears inside the modal
  const hasChip = await dash.$eval(
    "#record-modal [data-role='tag-chip']",
    (el) => !!el && el.textContent && el.textContent.trim().length > 0,
  );
  expect(hasChip).toBeTruthy();

  // Change color via color input
  const colorInputSel = '#record-modal [data-testid="modal-color-input"]';
  await dash.waitForSelector(colorInputSel, { timeout: 3000 });
  // Use evaluate to set value and dispatch input event to ensure reactivity
  await dash.evaluate((sel) => {
    const input = document.querySelector(sel);
    if (!input) throw new Error("color input not found");
    (input as HTMLInputElement).value = "#ff0000";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, colorInputSel);

  // Save modal
  await dash.click('[data-testid="modal-save-button"]');
  await dash.waitForSelector("#record-modal", {
    state: "detached",
    timeout: 5000,
  });

  // Query stored record via background message and assert tags and color updated
  const records = await dash.evaluate<{ ok: boolean; data?: any[] }>(
    async (url) => {
      return await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: "myz:getHighlightsForUrl", payload: { url } },
          (resp) => {
            if (chrome.runtime.lastError)
              return reject(new Error(chrome.runtime.lastError.message));
            resolve(resp);
          },
        );
      });
    },
    canonical,
  );

  // find our record by id
  const found = Array.isArray(records?.data)
    ? records.data.find((r) => r.id === recId)
    : null;
  expect(found).toBeTruthy();
  expect(found.tags && found.tags.includes("from-test")).toBeTruthy();
  expect(found.color).toBe("#ff0000");
});

test("import_by_file_via_settings", async () => {
  const dashboardUrl = `chrome-extension://${extensionId}/src/dashboard/index.html`;
  const dash = await context.newPage();
  await dash.goto(dashboardUrl);
  await dash.waitForSelector(".app-shell", { timeout: 5000 });

  // open settings via sidebar button
  await dash.click('button[aria-label="打开设置"]');
  await dash.waitForSelector("#settings-view.is-active, #settings-view", {
    timeout: 5000,
  });

  const importId = `file-import-${Date.now()}`;
  const canonical = `${serverUrl}/myz-test.html`;
  const importRecords = [
    {
      id: importId,
      url: canonical,
      sourceUrl: canonical,
      title: "File Import Test",
      text: "imported via file",
      html: "<p>imported via file</p>",
      note: "",
      tags: ["imported"],
      hostname: new URL(canonical).hostname,
      kind: "clip",
      createdAt: new Date().toISOString(),
    },
  ];

  // Attach file to file input using Playwright's setInputFiles API
  await dash.setInputFiles('#settings-view input[type="file"]', {
    name: "myz-import.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(importRecords)),
  });

  // choose overwrite strategy to ensure insertion
  await dash.selectOption("#settings-view select", "overwrite");

  // Click the import button inside the second settings group
  await dash.click(
    "#settings-view .settings__group:nth-of-type(2) .settings__actions button",
  );

  // Wait for import to complete by polling for the imported article
  // Navigate back to highlights view
  await dash.click(
    "#settings-view .settings__header .btn-link, #settings-view .btn-link",
  );
  // reload to ensure store refresh
  await dash.reload();
  await dash.waitForSelector(`article[data-id="${importId}"]`, {
    timeout: 5000,
  });
});

test("bulk_import_and_search_filters", async () => {
  const dashboardUrl = `chrome-extension://${extensionId}/src/dashboard/index.html`;
  const dash = await context.newPage();
  await dash.goto(dashboardUrl);
  await dash.waitForSelector(".app-shell", { timeout: 5000 });

  // Generate many records with varied createdAt, tags, hostname and text
  const canonicalBase = `${serverUrl}/myz-test.html`;
  const hosts = ["example.com", "alpha.test", "beta.example", "site.local"];
  const tagsPool = ["red", "blue", "green", "urgent", "todo"];
  const total = 120;
  const records = [];
  const now = Date.now();
  for (let i = 0; i < total; i++) {
    const host = hosts[i % hosts.length];
    const tags = [];
    // two tags per record (deterministic)
    tags.push(tagsPool[i % tagsPool.length]);
    tags.push(tagsPool[(i + 2) % tagsPool.length]);
    const includeKeyword = i % 7 === 0; // about ~1/7 records contain the target keyword
    const text = includeKeyword
      ? `record ${i} filter-target`
      : `record ${i} normal`;
    records.push({
      id: `bulk-${i}-${Date.now()}`,
      url: `${canonicalBase}#${i}`,
      sourceUrl: `${canonicalBase}#${i}`,
      title: `Bulk ${i}`,
      text,
      html: `<p>${text}</p>`,
      note: `note ${i}`,
      tags,
      hostname: host,
      kind: "clip",
      createdAt: new Date(now - i * 60000).toISOString(),
    });
  }

  // Import via background handler (replace strategy)
  const importResult = await dash.evaluate<{ ok: boolean }>(async (recs) => {
    return await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "myz:importHighlights",
          payload: { records: recs, strategy: "replace" },
        },
        (resp) => {
          if (chrome.runtime.lastError)
            return reject(new Error(chrome.runtime.lastError.message));
          resolve(resp);
        },
      );
    });
  }, records);
  expect(importResult && importResult.ok).toBeTruthy();

  // Verify background state contains all imported records (UI may lazy-load)
  const allHighlights = await dash.evaluate<{ ok: boolean; data?: any[] }>(
    async () => {
      return await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: "myz:getAllHighlights" }, (resp) => {
          if (chrome.runtime.lastError)
            return reject(new Error(chrome.runtime.lastError.message));
          resolve(resp);
        });
      });
    },
  );
  const allData = Array.isArray(allHighlights?.data) ? allHighlights.data : [];
  expect(allData.length).toBeGreaterThanOrEqual(total);

  // Reload dashboard (UI will show a subset due to lazy loading) and test search behavior
  await dash.reload();
  await dash.waitForSelector("article[data-id]", { timeout: 10000 });

  // Test search: query for the keyword 'filter-target' and assert that some matching records appear in the UI
  const searchInput = 'input[placeholder="搜索文本、批注或标签"]';
  await dash.fill(searchInput, "filter-target");
  // Wait a moment for filtering UI
  await dash.waitForTimeout(500);
  const filterCount = await dash.$$eval(
    "article[data-id]",
    (els) => els.length,
  );
  expect(filterCount).toBeGreaterThan(0);

  // Clear search and set hostname filter to one of the hosts and assert results exist
  await dash.fill(searchInput, "");
  await dash.waitForTimeout(200);
  // select hostname via the toolbar dropdown
  await dash.selectOption('select[data-testid="site-filter"]', hosts[1]);
  await dash.waitForTimeout(500);
  const hostFiltered = await dash.$$eval(
    "article[data-id]",
    (els) => els.length,
  );
  expect(hostFiltered).toBeGreaterThan(0);
});

test("infinite_scroll_loads_more", async () => {
  const dashboardUrl = `chrome-extension://${extensionId}/src/dashboard/index.html`;
  const dash = await context.newPage();
  await dash.goto(dashboardUrl);
  await dash.waitForSelector(".app-shell", { timeout: 5000 });

  // Import a moderate number of records to ensure pagination kicks in
  const canonicalBase = `${serverUrl}/myz-test.html`;
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

  const importResult = await dash.evaluate<{ ok: boolean }>(async (recs) => {
    return await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "myz:importHighlights",
          payload: { records: recs, strategy: "overwrite" },
        },
        (resp) => {
          if (chrome.runtime.lastError)
            return reject(new Error(chrome.runtime.lastError.message));
          resolve(resp);
        },
      );
    });
  }, records);
  expect(importResult && importResult.ok).toBeTruthy();

  // Reload and capture initial visible count
  await dash.reload();
  await dash.waitForSelector("article[data-id]", { timeout: 10000 });
  const initialCount = await dash.$$eval(
    "article[data-id]",
    (els) => els.length,
  );

  // If there's no sentinel, UI already shows everything — accept that as success
  const sentinel = await dash.$('.scroll-sentinel[data-role="sentinel"]');
  if (!sentinel) {
    expect(initialCount).toBeGreaterThanOrEqual(total);
    return;
  }

  // Scroll sentinel into view inside the .main root to trigger IntersectionObserver
  await dash.evaluate(() => {
    const root = document.querySelector(".main");
    const sentinel = document.querySelector(
      '.scroll-sentinel[data-role="sentinel"]',
    );
    if (sentinel && root) {
      // scroll the root so the sentinel is visible
      sentinel.scrollIntoView({ block: "end" });
      root.scrollTop = root.scrollHeight;
    }
  });

  // Wait for UI to load more items (count increases)
  await dash.waitForFunction(
    (prev) => document.querySelectorAll("article[data-id]").length > prev,
    initialCount,
    { timeout: 5000 },
  );
  const afterCount = await dash.$$eval("article[data-id]", (els) => els.length);
  expect(afterCount).toBeGreaterThan(initialCount);
});
