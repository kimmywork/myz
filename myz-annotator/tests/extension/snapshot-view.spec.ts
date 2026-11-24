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
  // Fold display (2026-11-24): the marked sentence is sharp; the rest folds
  // behind one 「…」 seam per hidden run, keeping a blurred hint of the next
  // block each side will reveal (there is still content here).
  await expect(view.locator("mark")).toContainText("snapshot anchor sentence");
  await expect(view.locator(".myz-snapshot-tear")).toHaveCount(1);
  const hints = view.locator(".myz-snapshot-fold-hint");
  await expect(hints).toHaveCount(3);
  await expect(hints.nth(0)).toContainText("Title");
  await expect(hints.nth(1)).toContainText("before");
  await expect(hints.nth(2)).toContainText("after");

  // 上半区从上侧划线处向内揭（先 Title）；gap0 只剩单块后不再有缝，
  // 点剩余提示继续揭（before）；单块段 gap1 同样点提示（after）。
  // data-revealed 挂在每个揭示块上，二次揭示后匹配 2 个 → 取最后一个。
  // 三段（上带 / 「…」行 / 下带）不重叠：上半区中点必须命中半区本身。
  // 2026-11-24 之前「…」压在两带交界处，中点距它只有 1px，CI 的字体度量
  // 差一点就让「展开一段」静默变成「整段展开」。
  const upCenterHit = await view
    .locator('.myz-snapshot-tear-half[data-side="up"]')
    .evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return (
        document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        )?.className ?? ""
      );
    });
  expect(upCenterHit).toContain("myz-snapshot-tear-half");
  await view.locator('.myz-snapshot-tear-half[data-side="up"]').click();
  await expect(view.locator('[data-revealed="gap-0-up"]')).toContainText(
    "Title",
  );
  await view.locator('.myz-snapshot-fold-hint[data-gap="0"]').click();
  await expect(view.locator('[data-revealed="gap-0-up"]').last()).toContainText(
    "before",
  );
  await view.locator('.myz-snapshot-fold-hint[data-gap="1"]').click();
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

  // 两个划线之间只有一条分割线；隐藏段落折叠，只在两侧各留一段模糊提示。
  const seams = dash.locator(".myz-snapshot-tear");
  await expect(seams).toHaveCount(1);
  const view = dash.getByTestId("snapshot-view");
  // 上侧提示 = 紧邻上侧划线的第一个隐藏块；下侧提示 = 紧邻下侧划线的块。
  await expect(view.locator(".myz-snapshot-fold-hint").first()).toContainText(
    "filler paragraph 0",
  );
  await expect(view.locator(".myz-snapshot-fold-hint").last()).toContainText(
    "filler paragraph 11",
  );
  // Hidden middle blocks stay in the DOM (display:none) so reveals repaint in
  // place — 「折叠」 is visibility, not absence (2026-11-24 抖动修复).
  await expect(
    view.locator("p", { hasText: "filler paragraph 6" }),
  ).toBeHidden();

  const regionTop = (index: number) =>
    dash
      .locator(`[data-region="${index}"]`)
      .evaluate((el) => el.getBoundingClientRect().top);

  // 规则（2026-11-24）：G 在视口内点下侧提示 → 按照 G 固定、向上揭 F。
  const downHint = view.locator('.myz-snapshot-fold-hint[data-side="down"]');
  await downHint.scrollIntoViewIfNeeded();
  const gBefore = await regionTop(1);
  // 揭示的块自身也不许跳：提示与揭示盒型一致（margin 归属固定）。
  const hintBefore = await downHint.evaluate(
    (el) => el.getBoundingClientRect().top,
  );
  await downHint.click();
  await expect(view.locator('[data-revealed="gap-0-down"]')).toContainText(
    "filler paragraph 11",
  );
  await dash.waitForTimeout(150);
  expect(Math.abs((await regionTop(1)) - gBefore)).toBeLessThan(5);
  const revealedTop = await dash
    .locator('[data-revealed="gap-0-down"]')
    .evaluate((el) => el.getBoundingClientRect().top);
  expect(Math.abs(revealedTop - hintBefore)).toBeLessThan(3);

  // A 在视口内点上侧提示 → 按照 A 固定、向下揭 B。
  const upHint = view.locator('.myz-snapshot-fold-hint[data-side="up"]');
  await upHint.scrollIntoViewIfNeeded();
  const aBefore = await regionTop(0);
  await upHint.click();
  await expect(view.locator('[data-revealed="gap-0-up"]')).toContainText(
    "filler paragraph 0",
  );
  await dash.waitForTimeout(150);
  expect(Math.abs((await regionTop(0)) - aBefore)).toBeLessThan(5);

  // 点「…」本体 → 整段完整展开；全部展开后不再有折叠线，中段块可见。
  await dash.locator(".myz-snapshot-tear-glyph").click();
  await dash.waitForTimeout(100);
  await expect(dash.locator(".myz-snapshot-tear")).toHaveCount(0);
  await expect(
    view.locator("p", { hasText: "filler paragraph 6" }),
  ).toBeVisible();
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

test("saving_again_replaces_the_page_snapshot_with_the_newest", async () => {
  const dash = await harness.open("/highlights");
  const url = pageUrl("versioned");
  const record = await save(dash, "versioned sentence", url);

  // A page keeps exactly one snapshot (2026-11-24): saving again — whatever
  // the URL's noise — replaces the previous copy instead of adding a version.
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

  // No version switcher: there is only one copy per page.
  await expect(dash.getByTestId("snapshot-versions")).toHaveCount(0);
  // The newest capture is the one rendered.
  await expect(dash.getByTestId("snapshot-view")).toContainText("newer body");
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
