import { test, expect } from "@playwright/test";
import { send, setupDashboardHarness } from "../helpers/dashboard-harness.js";

const harness = setupDashboardHarness();

/**
 * Creates one record on `pageUrl` (the page identity of a snapshot since
 * 2026-11-23: the viewer looks the page's copy up through the record's URL).
 */
async function save(
  dash: import("@playwright/test").Page,
  text: string,
  pageUrl: string,
  note = "",
) {
  return send<{ id: string }>(dash, "myz:saveHighlight", {
    url: pageUrl,
    sourceUrl: pageUrl,
    title: text,
    text,
    html: `<p>${text}</p>`,
    note,
    tags: [],
    hostname: new URL(pageUrl).hostname,
    kind: "clip",
  });
}

function pageUrl(name: string): string {
  return `https://example.com/${name}`;
}

test("viewer_folds_context_behind_seams_and_keeps_annotated_regions_sharp", async () => {
  const dash = await harness.open("/highlights");
  const url = pageUrl("article");
  const record = await save(dash, "snapshot anchor sentence", url);

  // Store a snapshot for that page the way the content script would.
  const saved = await send<{ ok: boolean }>(dash, "myz:saveSnapshot", {
    url,
    title: "Article",
    html: "<article><h1>Title</h1><p>before</p><p>snapshot anchor sentence</p><p>after</p></article>",
    css: "body{}",
    bytes: 200,
  });
  expect(saved.ok).toBe(true);

  await harness.navigate(dash, `/highlights/${record.id}`);
  await dash.waitForSelector('[data-testid="snapshot-view"]');

  const view = dash.getByTestId("snapshot-view");
  await expect(view).toBeVisible();
  // Header wording is fixed by the contract, date = when this copy was taken.
  const header = dash.getByTestId("snapshot-header");
  await expect(header).toContainText("快照 ");
  await expect(header).toContainText("· 原页可能已更新");
  await expect(header.getByRole("link", { name: "打开原页" })).toHaveAttribute(
    "href",
    url,
  );
  // The fixed status wording from the contract.
  await expect(dash.getByTestId("snapshot-status")).toContainText(
    "本机快照 · 占用",
  );
  await expect(dash.getByTestId("snapshot-status")).toContainText(
    "空间不足时最旧的会被清理",
  );
  // Fold display (2026-11-23): the marked sentence is sharp; the rest is
  // folded behind one 「…」 seam per hidden run — not rendered at all.
  await expect(view.locator("mark")).toContainText("snapshot anchor sentence");
  await expect(view.locator(".myz-snapshot-tear")).toHaveCount(2);
  await expect(view).not.toContainText("Title");

  // 点缝的上/下区 → 向该侧展开一段；点「…」本体 → 该段整段展开。
  await view.locator('.myz-snapshot-tear-half[data-side="up"]').first().click();
  await expect(view).toContainText("Title");
  await view.locator(".myz-snapshot-tear-glyph").first().click();
  await expect(view).toContainText("before");
  await view.locator(".myz-snapshot-tear-glyph").last().click();
  await expect(view).toContainText("after");
});

test("viewer_says_when_a_page_has_no_snapshot", async () => {
  const dash = await harness.open("/highlights");
  const record = await save(dash, "no snapshot for me", pageUrl("missing"));

  await harness.navigate(dash, `/highlights/${record.id}`);
  await dash.waitForSelector('[data-testid="snapshot-view"]');

  await expect(dash.getByTestId("snapshot-empty")).toContainText("还没有快照");
});

test("every_record_of_the_page_anchors_onto_the_same_copy", async () => {
  const dash = await harness.open("/highlights");
  const url = pageUrl("shared-page");
  // The first quote spans inline markup in the copy — placement must handle
  // it (the per-node matcher used to resolve it and then fail to mark it).
  const first = await save(dash, "first recorded sentence", url);
  await save(dash, "second recorded sentence", url);

  await send(dash, "myz:saveSnapshot", {
    url,
    title: "Shared",
    html: "<article><p>first <em>recorded</em> sentence</p><p>plain middle</p><p>second recorded sentence</p></article>",
    css: "",
  });

  await harness.navigate(dash, `/highlights/${first.id}`);
  await dash.waitForSelector('[data-testid="snapshot-view"]');

  // Both records land on the one copy: marked and counted.
  await expect(dash.getByTestId("snapshot-summary")).toContainText(
    "本页 2 条记录：2 条已标注",
  );
  const view = dash.getByTestId("snapshot-view");
  // The cross-inline quote is wrapped per text node (≥1 mark), the plain one
  // exactly once — either way each record is marked.
  expect(
    await view
      .locator("mark[data-myz-anchor]")
      .evaluateAll((nodes) => [
        ...new Set(nodes.map((n) => n.getAttribute("data-myz-anchor"))),
      ]),
  ).toHaveLength(2);
});

test("notes_show_in_a_page_margin_popover", async () => {
  const dash = await harness.open("/highlights");
  const url = pageUrl("annotated");
  const record = await save(dash, "annotated sentence", url, "这里有个想法");

  await send(dash, "myz:saveSnapshot", {
    url,
    title: "Annotated",
    html: "<article><p>before</p><p>annotated sentence</p></article>",
    css: "",
  });

  await harness.navigate(dash, `/highlights/${record.id}`);
  await dash.waitForSelector('[data-testid="snapshot-view"]');

  // 批注是页边 comment 图标，不占正文宽度；点击弹 popover 展示内容。
  const icon = dash.locator(".myz-snapshot-note-icon");
  await expect(icon).toHaveCount(1);
  await expect(dash.getByTestId("note-popover")).toHaveCount(0);
  await icon.click();
  await expect(dash.getByTestId("note-popover")).toContainText("这里有个想法");
  await dash.getByTestId("note-popover-close").click();
  await expect(dash.getByTestId("note-popover")).toHaveCount(0);
});

test("edit_panel_rides_in_the_pinned_header_bar", async () => {
  const dash = await harness.open("/highlights");
  const url = pageUrl("editable");
  const record = await save(dash, "editable sentence", url);

  await send(dash, "myz:saveSnapshot", {
    url,
    title: "Editable",
    html: "<article><p>editable sentence</p></article>",
    css: "",
  });

  await harness.navigate(dash, `/highlights/${record.id}`);
  await dash.waitForSelector('[data-testid="snapshot-view"]');

  await dash.getByRole("button", { name: "编辑" }).click();
  // 编辑面板出现在固定顶栏内：不用滚回页面顶部就能编辑。
  await expect(
    dash.getByTestId("viewer-sticky-bar").locator("textarea"),
  ).toBeVisible();
});

test("the_reading_column_keeps_its_full_width", async () => {
  const dash = await harness.open("/highlights");
  const url = pageUrl("wide");
  const record = await save(dash, "wide anchor sentence", url);

  await send(dash, "myz:saveSnapshot", {
    url,
    title: "Wide",
    html: "<article><p>wide anchor sentence</p></article>",
    css: "",
  });

  await harness.navigate(dash, `/highlights/${record.id}`);
  await dash.waitForSelector('[data-testid="snapshot-view"]');

  // 纸面不为批注预留边栏：阅读列宽度完整（回归 2026-11-23 的挤窄问题）。
  const width = await dash
    .getByTestId("snapshot-body")
    .evaluate((el) => el.getBoundingClientRect().width);
  expect(width).toBeGreaterThan(880);
});

test("long_hidden_content_folds_behind_one_seam_and_unfolds_stepwise", async () => {
  const dash = await harness.open("/highlights");
  const url = pageUrl("long-gap");
  const record = await save(dash, "first recorded sentence", url);
  await save(dash, "second recorded sentence", url);

  // A tall hidden run between the two records (each block is several lines).
  const filler = Array.from(
    { length: 12 },
    (_, i) => `<p>filler paragraph ${i} — ${"hidden content ".repeat(80)}</p>`,
  ).join("");
  await send(dash, "myz:saveSnapshot", {
    url,
    title: "Long gap",
    html: `<article><p>first recorded sentence</p>${filler}<p>second recorded sentence</p></article>`,
    css: "",
  });

  await harness.navigate(dash, `/highlights/${record.id}`);
  await dash.waitForSelector('[data-testid="snapshot-view"]');

  // 两个划线之间只有一条分割线；隐藏段落收起为零高，不占版面。
  const seams = dash.locator(".myz-snapshot-tear");
  await expect(seams).toHaveCount(1);
  await expect(dash.getByTestId("snapshot-view")).not.toContainText(
    "filler paragraph",
  );

  // 点缝的下半区 → 从中点向下展开一段；点上半区 → 向上展开一段。
  const scrollTopOf = () =>
    dash.evaluate(
      () => document.querySelector(".myz-workspace__body")?.scrollTop ?? -1,
    );
  await dash.locator('.myz-snapshot-tear-half[data-side="down"]').click();
  await expect(dash.getByTestId("snapshot-view")).toContainText(
    "filler paragraph 6",
  );

  // 展开两段后内容超出视口：视图平滑跟随展开处（工作区滚动容器滚动）。
  const scrollBefore = await scrollTopOf();
  await dash.locator('.myz-snapshot-tear-half[data-side="up"]').click();
  await expect(dash.getByTestId("snapshot-view")).toContainText(
    "filler paragraph 5",
  );
  await dash.waitForTimeout(400);
  const scrollAfter = await scrollTopOf();
  expect(scrollAfter).not.toBe(scrollBefore);

  // 点「…」本体 → 整段完整展开。
  await dash.locator(".myz-snapshot-tear-glyph").click();
  await dash.waitForTimeout(80);
  await expect(dash.locator(".myz-snapshot-tear")).toHaveCount(0);
  await expect(dash.getByTestId("snapshot-view")).toContainText(
    "filler paragraph 0",
  );
});

test("the_header_bar_stays_pinned_while_the_snapshot_scrolls", async () => {
  const dash = await harness.open("/highlights");
  const url = pageUrl("sticky");
  const record = await save(dash, "sticky anchor sentence", url);

  const filler = Array.from(
    { length: 12 },
    (_, i) =>
      `<p>filler paragraph ${i} — ${"scrolling content ".repeat(12)}</p>`,
  ).join("");
  await send(dash, "myz:saveSnapshot", {
    url,
    title: "Sticky",
    html: `<article><p>sticky anchor sentence</p>${filler}</article>`,
    css: "",
  });

  await harness.navigate(dash, `/highlights/${record.id}`);
  await dash.waitForSelector('[data-testid="snapshot-view"]');

  const bar = dash.getByTestId("viewer-sticky-bar");
  expect(await bar.evaluate((el) => getComputedStyle(el).position)).toBe(
    "sticky",
  );
});

test("unlocated_text_is_reported_and_still_linkable", async () => {
  const dash = await harness.open("/highlights");
  const url = pageUrl("rewritten");
  const record = await save(dash, "repeated sentence", url);

  // The same sentence twice in the saved copy: no honest way to pick one.
  await send(dash, "myz:saveSnapshot", {
    url,
    title: "Rewritten",
    html: "<article><p>repeated sentence</p><p>middle</p><p>repeated sentence</p></article>",
    css: "",
  });

  await harness.navigate(dash, `/highlights/${record.id}`);
  await dash.waitForSelector('[data-testid="snapshot-view"]');

  const notice = dash.getByTestId("snapshot-unlocated");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("出现了 2 次");
  await expect(
    notice.getByRole("link", { name: "打开原页看它原本的位置" }),
  ).toHaveAttribute("href", url);
  // Nothing is marked, because nothing could be placed honestly.
  await expect(dash.getByTestId("snapshot-view").locator("mark")).toHaveCount(
    0,
  );
});

test("missing_text_is_reported_too", async () => {
  const dash = await harness.open("/highlights");
  const url = pageUrl("rewritten-again");
  const record = await save(dash, "text that used to be here", url);

  await send(dash, "myz:saveSnapshot", {
    url,
    title: "Rewritten",
    html: "<article><p>the page was rewritten entirely</p></article>",
    css: "",
  });

  await harness.navigate(dash, `/highlights/${record.id}`);
  await dash.waitForSelector('[data-testid="snapshot-view"]');

  await expect(dash.getByTestId("snapshot-unlocated")).toContainText("找不到");
});

test("same_page_versions_are_grouped_and_newest_first", async () => {
  const dash = await harness.open("/highlights");
  const url = pageUrl("versioned");
  const record = await save(dash, "versioned sentence", url);

  // Two captures of the same page: one with tracking noise, one with a
  // fragment. They are one page, two versions — newest shown by default.
  await send(dash, "myz:saveSnapshot", {
    url: "https://example.com/versioned?utm_source=feed",
    title: "Older",
    html: "<article><p>versioned sentence older body</p></article>",
    css: "",
  });
  await dash.waitForTimeout(5);
  await send(dash, "myz:saveSnapshot", {
    url: "https://example.com/versioned#top",
    title: "Newer",
    html: "<article><p>versioned sentence newer body</p></article>",
    css: "",
  });

  await harness.navigate(dash, `/highlights/${record.id}`);
  await dash.waitForSelector('[data-testid="snapshot-view"]');

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
  const url = pageUrl("hostile");
  const record = await save(dash, "text that will not be found", url);

  // A stored snapshot carrying a script-bearing link. The capture-time strip
  // is not a security boundary once the HTML sits in storage, so the render
  // path must remove it — including on the unlocated branch, which is exactly
  // what a revised page produces.
  await send(dash, "myz:saveSnapshot", {
    url,
    title: "Hostile",
    html: `<article>
      <p>the page was rewritten entirely</p>
      <p><a href="javascript:alert(1)" id="bad">click me</a></p>
      <script>window.__pwned = true</script>
    </article>`,
    css: "",
  });

  await harness.navigate(dash, `/highlights/${record.id}`);
  await dash.waitForSelector('[data-testid="snapshot-view"]');

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
