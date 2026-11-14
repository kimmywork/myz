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

  await harness.navigate(dash, `/highlights/${record.id}`);
  await dash.waitForSelector('[data-testid="view-snapshot"]');
  await dash.getByTestId("view-snapshot").click();

  const view = dash.getByTestId("snapshot-view");
  await expect(view).toBeVisible();
  // Header wording is fixed by the contract, date = when this copy was taken.
  const header = dash.getByTestId("snapshot-header");
  await expect(header).toContainText("快照 ");
  await expect(header).toContainText("· 原页可能已更新");
  await expect(header.getByRole("link", { name: "打开原页" })).toHaveAttribute(
    "href",
    "https://example.com/article",
  );
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

  await harness.navigate(dash, `/highlights/${record.id}`);
  await dash.waitForSelector('[data-testid="view-snapshot"]');
  await dash.getByTestId("view-snapshot").click();

  await expect(dash.getByTestId("snapshot-empty")).toContainText("还没有快照");
});

test("unlocated_text_is_reported_and_still_linkable", async () => {
  const dash = await harness.open("/highlights");
  const record = await save(dash, "repeated sentence");

  // The same sentence twice in the saved copy: no honest way to pick one.
  await send(dash, "myz:saveSnapshot", {
    recordId: record.id,
    url: "https://example.com/rewritten",
    title: "Rewritten",
    html: "<article><p>repeated sentence</p><p>middle</p><p>repeated sentence</p></article>",
    css: "",
  });

  await harness.navigate(dash, `/highlights/${record.id}`);
  await dash.waitForSelector('[data-testid="view-snapshot"]');
  await dash.getByTestId("view-snapshot").click();

  const notice = dash.getByTestId("snapshot-unlocated");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("出现了 2 次");
  await expect(
    notice.getByRole("link", { name: "打开原页看它原本的位置" }),
  ).toHaveAttribute("href", "https://example.com/rewritten");
  // Nothing is marked, because nothing could be placed honestly.
  await expect(dash.getByTestId("snapshot-view").locator("mark")).toHaveCount(
    0,
  );
});

test("missing_text_is_reported_too", async () => {
  const dash = await harness.open("/highlights");
  const record = await save(dash, "text that used to be here");

  await send(dash, "myz:saveSnapshot", {
    recordId: record.id,
    url: "https://example.com/rewritten",
    title: "Rewritten",
    html: "<article><p>the page was rewritten entirely</p></article>",
    css: "",
  });

  await harness.navigate(dash, `/highlights/${record.id}`);
  await dash.waitForSelector('[data-testid="view-snapshot"]');
  await dash.getByTestId("view-snapshot").click();

  await expect(dash.getByTestId("snapshot-unlocated")).toContainText("找不到");
});

test("same_page_versions_are_grouped_and_newest_first", async () => {
  const dash = await harness.open("/highlights");
  const record = await save(dash, "versioned sentence");

  // Two captures of the same page: one with tracking noise, one with a
  // fragment. They are one page, two versions — newest shown by default.
  await send(dash, "myz:saveSnapshot", {
    recordId: record.id,
    url: "https://example.com/versioned?utm_source=feed",
    title: "Older",
    html: "<article><p>versioned sentence older body</p></article>",
    css: "",
  });
  await dash.waitForTimeout(5);
  await send(dash, "myz:saveSnapshot", {
    recordId: record.id,
    url: "https://example.com/versioned#top",
    title: "Newer",
    html: "<article><p>versioned sentence newer body</p></article>",
    css: "",
  });

  await harness.navigate(dash, `/highlights/${record.id}`);
  await dash.waitForSelector('[data-testid="view-snapshot"]');
  await dash.getByTestId("view-snapshot").click();

  const switcher = dash.getByTestId("snapshot-versions");
  await expect(switcher).toContainText("共 2 个版本");
  // The newest capture is the one rendered.
  await expect(dash.getByTestId("snapshot-view")).toContainText("newer body");
  await expect(dash.getByTestId("snapshot-version-0")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Switching shows the older body without merging anything.
  await dash.getByTestId("snapshot-version-1").click();
  await expect(dash.getByTestId("snapshot-view")).toContainText("older body");
});

test("an_unlocated_snapshot_is_still_sanitized", async () => {
  const dash = await harness.open("/highlights");
  const record = await save(dash, "text that will not be found");

  // A stored snapshot carrying a script-bearing link. The capture-time strip
  // is not a security boundary once the HTML sits in storage, so the render
  // path must remove it — including on the unlocated branch, which is exactly
  // what a revised page produces.
  await send(dash, "myz:saveSnapshot", {
    recordId: record.id,
    url: "https://example.com/hostile",
    title: "Hostile",
    html: `<article>
      <p>the page was rewritten entirely</p>
      <p><a href="javascript:alert(1)" id="bad">click me</a></p>
      <script>window.__pwned = true</script>
    </article>`,
    css: "",
  });

  await harness.navigate(dash, `/highlights/${record.id}`);
  await dash.waitForSelector('[data-testid="view-snapshot"]');
  await dash.getByTestId("view-snapshot").click();

  // Unlocated branch is what renders here.
  await expect(dash.getByTestId("snapshot-unlocated")).toBeVisible();

  const body = dash.getByTestId("snapshot-view").locator("article");
  await expect(body).toContainText("click me");
  // No executable link survived, and no script tag did either.
  const hrefs = await body
    .locator("a")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("href") ?? ""),
    );
  expect(
    hrefs.every((href) => !href.toLowerCase().startsWith("javascript:")),
  ).toBe(true);
  await expect(body.locator("script")).toHaveCount(0);
  expect(
    await dash.evaluate(() => (window as { __pwned?: boolean }).__pwned),
  ).toBeUndefined();
});
