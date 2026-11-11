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

async function openLibrary(dash: Page, count: number) {
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
