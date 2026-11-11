import { test, expect } from "@playwright/test";
import { send, setupDashboardHarness } from "../helpers/dashboard-harness.js";

const harness = setupDashboardHarness();

async function seed(dash: import("@playwright/test").Page, text: string) {
  const url = `${harness.serverUrl()}/myz-test.html`;
  const saved = await send<{ id?: string }>(dash, "myz:saveHighlight", {
    url,
    sourceUrl: url,
    title: text,
    text,
    html: `<p>${text}</p>`,
    note: "",
    tags: [],
    hostname: new URL(url).hostname,
    kind: "clip",
  });
  return saved.id!;
}

async function openViewer(dash: import("@playwright/test").Page, id: string) {
  await dash.goto(`${harness.dashboardUrl()}#/highlights/${id}`);
  await dash.waitForSelector('button:has-text("删除")', { timeout: 8000 });
}

async function present(dash: import("@playwright/test").Page, id: string) {
  const records = await send<Array<{ id: string }>>(
    dash,
    "myz:getAllHighlights",
  );
  return records.some((record) => record.id === id);
}

test("viewer_delete_keeps_the_undo_window_on_the_list", async () => {
  const dash = await harness.open("/highlights");
  const id = await seed(dash, "viewer undo");
  await openViewer(dash, id);

  await dash.getByRole("button", { name: "删除" }).click();
  await expect(dash).toHaveURL(/#\/highlights$/);
  await expect(dash.getByTestId("undo-bar")).toContainText("已删除 1 条");

  await dash
    .getByTestId("undo-bar")
    .getByRole("button", { name: "撤销" })
    .click();
  await expect(dash.getByTestId("undo-bar")).toHaveCount(0);
  await expect.poll(() => present(dash, id)).toBe(true);
});

test("viewer_delete_commits_when_the_user_navigates_away", async () => {
  const dash = await harness.open("/highlights");
  const id = await seed(dash, "viewer navigate");
  await openViewer(dash, id);

  await dash.getByRole("button", { name: "删除" }).click();
  await expect(dash.getByTestId("undo-bar")).toBeVisible();

  // A real user navigation must commit, not be swallowed by the marker.
  await dash.locator('[data-testid="rail-inbox"]').click();
  await expect(dash).toHaveURL(/#\/inbox/);
  await expect(dash.getByTestId("undo-bar")).toHaveCount(0);
  await expect.poll(() => present(dash, id), { timeout: 8000 }).toBe(false);
});

test("viewer_delete_commits_when_the_window_expires", async () => {
  const dash = await harness.open("/highlights");
  const id = await seed(dash, "viewer expiry");
  await openViewer(dash, id);

  await dash.getByRole("button", { name: "删除" }).click();
  await expect(dash.getByTestId("undo-bar")).toBeVisible();

  await expect(dash.getByTestId("undo-bar")).toHaveCount(0, {
    timeout: 9000,
  });
  await expect.poll(() => present(dash, id), { timeout: 8000 }).toBe(false);
});
