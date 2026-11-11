import { test, expect } from "@playwright/test";
import { send, setupDashboardHarness } from "../helpers/dashboard-harness.js";

const harness = setupDashboardHarness();

async function save(
  dash: import("@playwright/test").Page,
  text: string,
  note = "",
) {
  const url = `${harness.serverUrl()}/myz-test.html`;
  return send<{ id?: string }>(dash, "myz:saveHighlight", {
    url,
    sourceUrl: url,
    title: text,
    text,
    html: `<p>${text}</p>`,
    note,
    tags: [],
    hostname: new URL(url).hostname,
    kind: "clip",
  });
}

async function recordCount(dash: import("@playwright/test").Page) {
  return (await send<unknown[]>(dash, "myz:getAllHighlights")).length;
}

async function batchRecordCount(dash: import("@playwright/test").Page) {
  const records = await send<Array<{ text?: string }>>(
    dash,
    "myz:getAllHighlights",
  );
  return records.filter((record) => (record.text || "").startsWith("batch "))
    .length;
}

test("single_unannotated_delete_can_be_undone", async () => {
  const dash = await harness.open("/inbox");
  await save(dash, "undo me");
  await dash.reload();
  await dash.waitForSelector('[data-testid="inbox-row"]');

  await dash
    .locator('[data-testid="inbox-row"]', { hasText: "undo me" })
    .getByRole("button", { name: "删除" })
    .click();

  await expect(dash.getByTestId("undo-bar")).toContainText("已删除 1 条");
  await expect(
    dash.locator('[data-testid="inbox-row"]', { hasText: "undo me" }),
  ).toHaveCount(0);

  await dash
    .getByTestId("undo-bar")
    .getByRole("button", { name: "撤销" })
    .click();
  await expect(
    dash.locator('[data-testid="inbox-row"]', { hasText: "undo me" }),
  ).toBeVisible();
  await expect.poll(() => recordCount(dash)).toBeGreaterThanOrEqual(1);
});

test("annotated_single_delete_asks_before_deleting", async () => {
  const dash = await harness.open("/inbox");
  await save(dash, "annotated item", "keep this thought");
  await dash.reload();
  await dash.waitForSelector('[data-testid="inbox-row"]');

  const row = dash.locator('[data-testid="inbox-row"]', {
    hasText: "annotated item",
  });
  await row.getByRole("button", { name: "删除" }).click();

  const confirm = dash.locator(".myz-confirm");
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "取消" }).click();
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "删除" }).click();
  await confirm.getByRole("button", { name: "删除" }).click();
  await expect(row).toHaveCount(0);
  // Confirmation replaces undo: no 撤销 bar for annotated records.
  await expect(dash.getByTestId("undo-bar")).toHaveCount(0);
});

test("batch_delete_commits_when_leaving_the_route", async () => {
  const dash = await harness.open("/inbox");
  for (let i = 0; i < 40; i += 1) await save(dash, `batch ${i}`);
  await dash.reload();
  await dash.waitForSelector('[data-testid="inbox-row"]');
  await dash.waitForTimeout(300);

  // Select every visible row, then delete the batch.
  const boxes = dash.locator(
    '[data-testid="inbox-row"] input[type="checkbox"]',
  );
  const count = await boxes.count();
  for (let i = 0; i < count; i += 1) await boxes.nth(i).check();
  await dash.getByRole("button", { name: "批量删除" }).click();
  await expect(dash.getByTestId("undo-bar")).toContainText(/已删除 \d+ 条/);

  // Leaving the route commits instead of dropping the pending delete.
  await dash.locator('[data-testid="rail-highlights"]').click();
  await dash.waitForSelector('[data-testid="workspace-shell"]');
  await dash.locator('[data-testid="rail-inbox"]').click();
  await dash
    .waitForSelector('[data-testid="inbox-row"]', {
      state: "attached",
      timeout: 5000,
    })
    .catch(() => undefined);

  // Other tests in this file share the harness profile; only the batch matters.
  await expect.poll(() => batchRecordCount(dash), { timeout: 8000 }).toBe(0);
});
