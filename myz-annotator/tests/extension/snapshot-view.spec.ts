import { test, expect } from "@playwright/test";
import { send, setupDashboardHarness } from "../helpers/dashboard-harness.js";

const harness = setupDashboardHarness();

async function save(dash: import("@playwright/test").Page, text: string) {
  const url = `${harness.serverUrl()}/myz-test.html`;
  return send<{ id: string }>(dash, "myz:saveHighlight", {
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
}

test("viewer_shows_a_saved_snapshot_with_its_status_line", async () => {
  const dash = await harness.open("/highlights");
  const record = await save(dash, "snapshot anchor sentence");

  // Store a snapshot for that record the way the content script would.
  const saved = await send<{ ok: boolean }>(dash, "myz:saveSnapshot", {
    recordId: record.id,
    url: "https://example.com/article",
    title: "Article",
    html: "<article><h1>Title</h1><p>before</p><p>snapshot anchor sentence</p><p>after</p></article>",
    css: "body{}",
    bytes: 200,
  });
  expect(saved.ok).toBe(true);

  await dash.goto(`${dash.url().replace(/#.*$/, "#")}/highlights/${record.id}`);
  await dash.waitForSelector('[data-testid="view-snapshot"]');
  await dash.getByTestId("view-snapshot").click();

  const view = dash.getByTestId("snapshot-view");
  await expect(view).toBeVisible();
  // The fixed status wording from the contract.
  await expect(dash.getByTestId("snapshot-status")).toContainText(
    "本机快照 · 占用",
  );
  await expect(dash.getByTestId("snapshot-status")).toContainText(
    "空间不足时最旧的会被清理",
  );
  // Body rendered, record text marked.
  await expect(view).toContainText("Title");
  await expect(view.locator("mark")).toContainText("snapshot anchor sentence");
});

test("viewer_says_when_a_record_has_no_snapshot", async () => {
  const dash = await harness.open("/highlights");
  const record = await save(dash, "no snapshot for me");

  await dash.goto(`${dash.url().replace(/#.*$/, "#")}/highlights/${record.id}`);
  await dash.waitForSelector('[data-testid="view-snapshot"]');
  await dash.getByTestId("view-snapshot").click();

  await expect(dash.getByTestId("snapshot-empty")).toContainText("还没有快照");
});
