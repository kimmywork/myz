import { test, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  send,
  setupDashboardHarness,
} from "../helpers/dashboard-harness.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const harness = setupDashboardHarness();

test("dashboard_lists_and_deletes_highlight_and_exports", async () => {
  const dash = await harness.open();
  const canonical = `${harness.serverUrl()}/myz-test.html`;
  const saved = await send<{ id?: string }>(dash, "myz:saveHighlight", {
    url: canonical,
    sourceUrl: canonical,
    title: "Dashboard Test Page",
    text: "dashboard snippet",
    html: "<p>dashboard snippet</p>",
    note: "note",
    tags: [],
    hostname: new URL(canonical).hostname,
    kind: "clip",
  });
  const savedId = saved?.id || null;

  await dash.reload();
  await dash.waitForSelector(`article[data-id]`, { timeout: 5000 });
  const cardSelector = savedId
    ? `article[data-id="${savedId}"]`
    : "article.card";
  const card = await dash.$(cardSelector);
  expect(card).toBeTruthy();

  const deleteBtn = await card?.$('button[title="删除"]');
  expect(deleteBtn).toBeTruthy();
  await deleteBtn?.click();
  await dash.waitForSelector(cardSelector, {
    state: "detached",
    timeout: 5000,
  });

  const exportResult = await send<{ markdown?: string }>(dash, "myz:export");
  expect(exportResult?.markdown || "").not.toContain("dashboard snippet");
});

test("dashboard_edit_downgrade_and_import_flows", async () => {
  const dash = await harness.open();
  const dashboardUrl = harness.dashboardUrl();
  const canonical = `${harness.serverUrl()}/myz-test.html`;

  // 1) Edit flow: create a clip, open the viewer editor, change the note.
  const savedClip = await send<{ id?: string }>(dash, "myz:saveHighlight", {
    url: canonical,
    sourceUrl: canonical,
    title: "Edit Test",
    text: "edit snippet",
    html: "<p>edit snippet</p>",
    note: "original note",
    tags: [],
    hostname: new URL(canonical).hostname,
    kind: "clip",
  });
  const clipId = savedClip?.id || null;
  await dash.reload();
  await dash.waitForSelector(`article[data-id]`, { timeout: 5000 });
  const clipSelector = clipId ? `article[data-id="${clipId}"]` : "article.card";

  await dash.evaluate((sel) => {
    const card = document.querySelector(sel);
    if (!card) throw new Error("card not found");
    const edit = Array.from(card.querySelectorAll("button")).find(
      (b) => b.getAttribute("title") === "编辑",
    );
    if (!edit) throw new Error("edit button not found");
    edit.click();
  }, clipSelector);

  await dash.waitForSelector(".field textarea", { timeout: 5000 });
  await dash.fill(".field textarea", "edited note via test");
  await dash.evaluate(() => {
    const save = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "保存",
    );
    if (!save) throw new Error("save button not found");
    save.click();
  });
  await dash.waitForSelector(".field textarea", {
    state: "detached",
    timeout: 5000,
  });

  await dash.goto(`${dashboardUrl}#/highlights`);
  await dash.waitForSelector(clipSelector, { timeout: 5000 });
  const noteText = await dash.evaluate((sel) => {
    const card = document.querySelector(sel);
    if (!card) return "";
    for (const section of Array.from(card.querySelectorAll("section"))) {
      const h4 = section.querySelector("h4");
      if (h4?.textContent?.includes("批注")) {
        return section.querySelector("p")?.textContent || "";
      }
    }
    return "";
  }, clipSelector);
  expect(noteText).toContain("edited note via test");

  // 2) Downgrade flow: create a highlight then downgrade it to a clip.
  const savedHl = await send<{ id?: string }>(dash, "myz:saveHighlight", {
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
  });
  const hlId = savedHl?.id || null;
  await dash.reload();
  const hlSelector = hlId ? `article[data-id="${hlId}"]` : "article.card";
  await dash.waitForSelector(hlSelector, { timeout: 5000 });

  await dash.evaluate((sel) => {
    const card = document.querySelector(sel);
    if (!card) throw new Error("highlight card not found");
    const down = Array.from(card.querySelectorAll("button")).find(
      (b) => b.getAttribute("title") === "降级",
    );
    if (!down) throw new Error("downgrade button not found");
    down.click();
  }, hlSelector);
  await dash.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      return el && el.getAttribute("data-kind") === "clip";
    },
    hlSelector,
    { timeout: 5000 },
  );

  // 3) Import flow.
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
  await send(dash, "myz:importHighlights", {
    records: importRecord,
    strategy: "replace",
  });
  await dash.reload();
  await dash.waitForSelector(`article[data-id="${importRecord[0].id}"]`, {
    timeout: 5000,
  });
});

test("viewer_tag_edit_checks", async () => {
  const dash = await harness.open();
  const canonical = `${harness.serverUrl()}/myz-test.html`;
  const saved = await send<{ id?: string }>(dash, "myz:saveHighlight", {
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
  });
  const recId = saved?.id || null;
  await dash.reload();
  await dash.waitForSelector(`article[data-id]`, { timeout: 5000 });
  const selector = recId ? `article[data-id="${recId}"]` : "article.card";

  await dash.evaluate((sel) => {
    const card = document.querySelector(sel);
    if (!card) throw new Error("card not found");
    const edit = Array.from(card.querySelectorAll("button")).find(
      (b) => b.getAttribute("title") === "编辑",
    );
    if (!edit) throw new Error("edit button not found");
    edit.click();
  }, selector);

  await dash.waitForSelector(".field textarea", { timeout: 5000 });
  const tagInputSel = '[data-testid="tag-input-field"]';
  await dash.waitForSelector(tagInputSel, { timeout: 3000 });
  await dash.focus(tagInputSel);
  await dash.type(tagInputSel, "from-test");
  await dash.keyboard.press("Enter");

  const hasChip = await dash.$eval(
    '[data-role="tag-chip"]',
    (el) => !!el && el.textContent && el.textContent.trim().length > 0,
  );
  expect(hasChip).toBeTruthy();

  await dash.evaluate(() => {
    const save = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "保存",
    );
    if (!save) throw new Error("save button not found");
    save.click();
  });
  await dash.waitForSelector(".field textarea", {
    state: "detached",
    timeout: 5000,
  });

  const records = await send<Array<{ id: string; tags?: string[]; color?: string }>>(
    dash,
    "myz:getHighlightsForUrl",
    { url: canonical },
  );
  const found = Array.isArray(records)
    ? records.find((r) => r.id === recId)
    : null;
  expect(found).toBeTruthy();
  expect(found?.tags?.includes("from-test")).toBeTruthy();
  expect(found?.color).toBe("#00ff00");
});

test("import_by_file_via_settings", async () => {
  const dash = await harness.open();
  const canonical = `${harness.serverUrl()}/myz-test.html`;
  const importId = `file-import-${Date.now()}`;
  await send(dash, "myz:importHighlights", {
    records: [
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
    ],
    strategy: "overwrite",
  });
  await dash.reload();
  await dash.waitForSelector(`article[data-id="${importId}"]`, {
    timeout: 5000,
  });
});

test("import_through_settings_ui_uploads_real_files", async () => {
  const dash = await harness.open("/settings/import");
  await dash.waitForSelector(".settings__group", { timeout: 8000 });

  const importNav = dash.locator('a[href="#/settings/import"]');
  await expect(importNav).toHaveCount(1);

  const jsonFile = path.join(
    __dirname,
    "..",
    "fixtures",
    "import",
    "myz-import.json",
  );
  await dash.setInputFiles('input[type="file"]', jsonFile);
  await dash.selectOption('[data-testid="import-strategy"]', "overwrite");
  await dash.click('button:has-text("开始导入")');

  await dash.waitForFunction(
    () => {
      const el = document.querySelector(".status-line");
      return !!el && /导入完成/.test((el as HTMLElement).textContent || "");
    },
    undefined,
    { timeout: 8000 },
  );

  const allData = await send<Array<Record<string, unknown>>>(
    dash,
    "myz:getAllHighlights",
  );
  const findImport = (id: string) =>
    allData.find((record) => record.id === id);
  expect(findImport("ui-import-json-a")).toMatchObject({
    kind: "clip",
    text: "imported from myz json file a",
    note: "note from json a",
  });
  expect(findImport("ui-import-json-a")?.tags).toContain("imported");
  expect(findImport("ui-import-json-b")).toBeTruthy();
});
