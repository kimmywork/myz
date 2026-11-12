import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { send, setupDashboardHarness } from "../helpers/dashboard-harness.js";

const harness = setupDashboardHarness();

/**
 * Seeded library records: enough to spill past one pagination batch (24) so
 * "select all" can be checked against the rendered page instead of the whole
 * view.
 */
function seed(count: number) {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => {
    const text = `selection record ${i}`;
    const url = `https://example.com/page?${i}`;
    return {
      id: `sel-${i}`,
      url,
      sourceUrl: url,
      title: text,
      text,
      html: `<p>${text}</p>`,
      note: "",
      tags: [],
      hostname: "example.com",
      kind: "clip",
      createdAt: new Date(now - i * 60_000).toISOString(),
    };
  });
}

async function resetRecords(dash: Page) {
  // The import strategy only de-duplicates by id, so clear first: the counts in
  // this spec are absolute ("共 N"), not "at least N".
  const existing = await send<Array<{ id: string }>>(
    dash,
    "myz:getAllHighlights",
  );
  if (existing.length) {
    await send(dash, "myz:removeRecordsByIds", {
      ids: existing.map((record) => record.id),
    });
  }
}

async function openLibrary(dash: Page, count: number) {
  await resetRecords(dash);
  await send(dash, "myz:importHighlights", {
    records: seed(count),
    strategy: "replace",
  });
  await dash.reload();
  await dash.waitForSelector('[data-testid="select-record"]');
}

test("select_all_only_covers_the_rendered_page", async () => {
  const dash = await harness.open("/highlights");
  await openLibrary(dash, 60);

  const checkboxes = dash.locator('[data-testid="select-record"]');
  await checkboxes.first().check();

  const bar = dash.getByTestId("selection-bar");
  await expect(bar).toContainText("已选 1（共 60）");

  await bar.getByRole("checkbox", { name: "全选当前页" }).check();
  // 24 is the pagination batch: only the rendered page is selected.
  await expect(bar).toContainText("已选 24（共 60）");

  // Deselecting everything removes the bar itself.
  await bar.getByRole("checkbox", { name: "全选当前页" }).click();
  await expect(bar).toHaveCount(0);
});

test("switching_tab_clears_the_selection", async () => {
  const dash = await harness.open("/highlights");
  await openLibrary(dash, 10);

  const checkboxes = dash.locator('[data-testid="select-record"]');
  await checkboxes.nth(0).check();
  await checkboxes.nth(1).check();
  await expect(dash.getByTestId("selection-bar")).toContainText(
    "已选 2（共 10）",
  );

  await dash.getByTestId("rail-inbox").click();
  await expect(dash).toHaveURL(/#\/inbox/);
  await dash.getByTestId("rail-highlights").click();
  await expect(dash).toHaveURL(/#\/highlights/);
  await dash.waitForSelector('[data-testid="select-record"]');

  await expect(dash.getByTestId("selection-bar")).toHaveCount(0);
  await expect(
    dash.locator('[data-testid="select-record"]:checked'),
  ).toHaveCount(0);
});

test("switching_cards_and_list_keeps_the_selection", async () => {
  const dash = await harness.open("/highlights");
  await openLibrary(dash, 10);

  const checkboxes = dash.locator('[data-testid="select-record"]');
  await checkboxes.nth(0).check();
  await checkboxes.nth(1).check();

  await dash.getByRole("button", { name: "列表" }).click();
  await expect(dash.getByTestId("selection-bar")).toContainText(
    "已选 2（共 10）",
  );
  await expect(
    dash.locator('[data-testid="select-record"]:checked'),
  ).toHaveCount(2);

  await dash.getByRole("button", { name: "卡片" }).click();
  await expect(dash.getByTestId("selection-bar")).toContainText(
    "已选 2（共 10）",
  );
});

function record(id: string, ageMs: number, note = "") {
  const text = `record ${id}`;
  const url = `https://example.com/${id}`;
  return {
    id,
    url,
    sourceUrl: url,
    title: text,
    text,
    html: `<p>${text}</p>`,
    note,
    tags: [],
    hostname: "example.com",
    kind: "clip",
    createdAt: new Date(Date.now() - ageMs).toISOString(),
  };
}

test("bulk_delete_undoes_the_batch_in_place", async () => {
  const dash = await harness.open("/highlights");
  await resetRecords(dash);
  const hour = 3_600_000;
  const day = 24 * hour;
  await send(dash, "myz:importHighlights", {
    records: [
      record("keep-1", hour),
      record("keep-2", 2 * hour),
      record("keep-3", 3 * hour),
      record("keep-4", 4 * hour),
      record("keep-5", 5 * hour),
      record("batch-a", 5 * day, "annotated batch"),
      record("batch-b", 3 * day),
      record("batch-c", 2 * day),
    ],
    strategy: "replace",
  });
  await dash.reload();

  const rows = dash.locator('[data-view="cards"] article[data-id]');
  await expect(rows).toHaveCount(8);
  const orderBefore = await rows.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-id")),
  );

  for (const id of ["batch-a", "batch-b", "batch-c"]) {
    await dash
      .locator(`[data-id="${id}"] [data-testid="select-record"]`)
      .check();
  }
  const bar = dash.getByTestId("selection-bar");
  await expect(bar).toContainText("已选 3（共 8）");

  await bar.getByRole("button", { name: "批量删除" }).click();

  // One group: the whole batch leaves together and one bar undoes it.
  await expect(dash.getByTestId("undo-bar")).toContainText(
    "已删除 3 条（含 1 条带批注）",
  );
  await expect(rows).toHaveCount(5);

  await dash
    .getByTestId("undo-bar")
    .getByRole("button", { name: "撤销" })
    .click();

  await expect(rows).toHaveCount(8);
  const orderAfter = await rows.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-id")),
  );
  // Same records back under their original date groups, in the same order.
  expect(orderAfter).toEqual(orderBefore);
});

test("bulk_tag_applies_to_every_selected_record", async () => {
  const dash = await harness.open("/highlights");
  await openLibrary(dash, 6);

  const checkboxes = dash.locator('[data-testid="select-record"]');
  await checkboxes.nth(0).check();
  await checkboxes.nth(1).check();

  const bar = dash.getByTestId("selection-bar");
  await bar.getByLabel("要添加的标签").fill("bulk-tag");
  await bar.getByRole("button", { name: "打标签" }).click();

  await expect(dash.getByText("已为 2 条加上标签「bulk-tag」")).toBeVisible();
  const records = await send<Array<{ tags?: string[] }>>(
    dash,
    "myz:getAllHighlights",
  );
  expect(
    records.filter((entry) => (entry.tags || []).includes("bulk-tag")),
  ).toHaveLength(2);
  await expect(bar).toHaveCount(0);
});

test("select_all_skips_rows_pending_deletion", async () => {
  const dash = await harness.open("/highlights");
  await openLibrary(dash, 4);

  // Delete one row: it leaves the list and waits out the undo window.
  await dash
    .locator('[data-testid="select-record"]')
    .first()
    .locator("xpath=ancestor::article[1]")
    .getByRole("button", { name: /删除/ })
    .click();
  await expect(dash.getByTestId("select-record")).toHaveCount(3);

  // Select-all must cover only what is on screen (3), not the hidden pending row.
  await dash.locator('[data-testid="select-record"]').first().check();
  const bar = dash.getByTestId("selection-bar");
  await bar.getByRole("checkbox", { name: "全选当前页" }).check();
  await expect(bar).toContainText("已选 3（共 4）");
});
