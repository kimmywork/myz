import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { send, setupDashboardHarness } from "../helpers/dashboard-harness.js";

const harness = setupDashboardHarness();

/** An 8×6 PNG data URL, so staging does not depend on a fixture file. */
async function pngDataUrl(page: Page): Promise<string> {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 6;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.fillStyle = "#2d7ff9";
    ctx.fillRect(0, 0, 8, 6);
    return canvas.toDataURL("image/png");
  });
}

async function stage(
  page: Page,
  name: string,
  sourceKind: "image" | "video-frame" | "screenshot",
) {
  const dataUrl = await pngDataUrl(page);
  return send<{ id: string }>(page, "myz:stageAsset", {
    dataUrl,
    name,
    mime: "image/png",
    width: 8,
    height: 6,
    sourceKind,
    sourceUrl: "https://example.com/article",
  });
}

/** Records survive across tests in one extension context; start clean. */
async function resetRecords(dash: Page) {
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

async function openAssets(dash: Page) {
  await resetRecords(dash);
  await send(dash, "myz:clearStagedAssets");
  await stage(dash, "页面图片", "image");
  await stage(dash, "视频帧", "video-frame");
  await stage(dash, "选区截图", "screenshot");
  // A same-URL goto does not reload, so the page would keep its mount-time
  // (empty) list. Reload is what a user's next visit does.
  await dash.reload();
  await dash.waitForSelector('[data-testid="asset-card"]');
}

test("assets_page_lists_captures_with_kind_badges", async () => {
  const dash = await harness.open("/assets");
  await openAssets(dash);

  await expect(dash.getByTestId("asset-card")).toHaveCount(3);
  const grid = dash.getByTestId("asset-grid");
  await expect(grid).toContainText("网页图片");
  await expect(grid).toContainText("视频帧");
  await expect(grid).toContainText("截图");
  await expect(dash.getByTestId("assets-usage")).toContainText("3 张");

  // The rail entry is how the user gets here.
  await dash.getByTestId("rail-assets").click();
  await expect(dash).toHaveURL(/#\/assets/);
});

test("assets_page_previews_the_full_image", async () => {
  const dash = await harness.open("/assets");
  await openAssets(dash);

  await dash.getByRole("button", { name: "预览 视频帧" }).click();
  const preview = dash.getByTestId("asset-preview");
  await expect(preview).toBeVisible();
  await expect(preview.locator("img")).toHaveAttribute(
    "src",
    /^data:image\/png/,
  );

  await dash.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);
});

test("assets_batch_delete_can_be_undone", async () => {
  const dash = await harness.open("/assets");
  await openAssets(dash);

  await dash
    .getByTestId("asset-card")
    .filter({ hasText: "视频帧" })
    .getByTestId("select-asset")
    .check();
  await dash
    .getByTestId("asset-card")
    .filter({ hasText: "选区截图" })
    .getByTestId("select-asset")
    .check();

  const bar = dash.getByTestId("selection-bar");
  await expect(bar).toContainText("已选 2（共 3）");
  await bar.getByRole("button", { name: "批量删除" }).click();

  await expect(dash.getByTestId("undo-bar")).toContainText("已删除 2 张素材");
  await expect(dash.getByTestId("asset-card")).toHaveCount(1);

  await dash
    .getByTestId("undo-bar")
    .getByRole("button", { name: "撤销" })
    .click();
  await expect(dash.getByTestId("asset-card")).toHaveCount(3);

  // The bytes really survive an undo.
  const list = await send<unknown[]>(dash, "myz:listStagedAssets");
  expect(list).toHaveLength(3);
});

test("assets_single_delete_commits_after_the_window", async () => {
  const dash = await harness.open("/assets");
  await openAssets(dash);

  await dash
    .getByTestId("asset-card")
    .filter({ hasText: "页面图片" })
    .getByRole("button", { name: "删除" })
    .click();
  await expect(dash.getByTestId("asset-card")).toHaveCount(2);
  await expect(dash.getByTestId("undo-bar")).toContainText("已删除 1 张素材");

  // No undo: the record is really gone once the window ends.
  await expect
    .poll(
      async () => (await send<unknown[]>(dash, "myz:listStagedAssets")).length,
      {
        timeout: 12_000,
      },
    )
    .toBe(2);
  await expect(dash.getByTestId("asset-card")).toHaveCount(2);
});

test("assets_page_shows_the_empty_state", async () => {
  const dash = await harness.open("/assets");
  await send(dash, "myz:clearStagedAssets");
  await dash.reload();
  await dash.waitForSelector("text=缓存区还是空的");
  await expect(dash.getByTestId("asset-card")).toHaveCount(0);
});

test("bottom_nav_fits_five_items_on_a_phone", async () => {
  const dash = await harness.open("/assets");
  await dash.setViewportSize({ width: 375, height: 780 });
  await dash.reload();

  const bottom = dash.locator(".myz-workspace__bottom");
  await expect(bottom).toBeVisible();
  // Five destinations (文库/Inbox/阅读/素材/设置) must not overflow 375px.
  for (const key of ["highlights", "inbox", "readers", "assets", "settings"]) {
    await expect(dash.getByTestId(`bottom-nav-${key}`)).toBeVisible();
  }
  const overflow = await bottom.evaluate(
    (node) => node.scrollWidth - node.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("deleting_a_selected_card_clears_its_selection", async () => {
  const dash = await harness.open("/assets");
  await openAssets(dash);

  const card = dash.getByTestId("asset-card").filter({ hasText: "页面图片" });
  await card.getByTestId("select-asset").check();
  await expect(dash.getByTestId("selection-bar")).toContainText(
    "已选 1（共 3）",
  );

  await card.getByRole("button", { name: "删除" }).click();

  // Its row is gone, so it must not stay in the count either.
  await expect(dash.getByTestId("asset-card")).toHaveCount(2);
  await expect(dash.getByTestId("selection-bar")).toHaveCount(0);
});

test("saves_captures_as_records_with_attachment_and_context", async () => {
  const dash = await harness.open("/assets");
  await openAssets(dash);

  const card = dash.getByTestId("asset-card").filter({ hasText: "视频帧" });
  await card.getByRole("button", { name: "存为记录" }).click();
  await expect(dash.getByText("已存为 1 条记录")).toBeVisible();

  const records = await send<Array<Record<string, unknown>>>(
    dash,
    "myz:getAllHighlights",
  );
  const saved = records.find(
    (record) =>
      Array.isArray(record.attachments) &&
      (record.attachments as Array<{ assetId?: string }>).length > 0,
  );
  expect(saved).toBeTruthy();
  const attachments = saved!.attachments as Array<Record<string, unknown>>;
  expect(attachments).toHaveLength(1);
  expect(typeof attachments[0].assetId).toBe("string");
  expect(attachments[0].mime).toBe("image/png");
  // The record points at the host page, not at the image file.
  expect(String(saved!.url)).toContain("example.com");
  // No new schema id or version: the additive-field promise.
  expect(saved!.schemaVersion).toBe("1.0.0");
  expect(
    saved!.schemaId === undefined || saved!.schemaId === "myz.record",
  ).toBe(true);
});

test("batch_save_uses_the_shared_context", async () => {
  const dash = await harness.open("/assets");
  await openAssets(dash);

  for (const name of ["视频帧", "选区截图"]) {
    await dash
      .getByTestId("asset-card")
      .filter({ hasText: name })
      .getByTestId("select-asset")
      .check();
  }
  await dash.getByRole("button", { name: "批量存为记录" }).click();
  await expect(dash.getByText("已存为 2 条记录")).toBeVisible();

  const records = await send<Array<Record<string, unknown>>>(
    dash,
    "myz:getAllHighlights",
  );
  const saved = records.filter((record) => Array.isArray(record.attachments));
  expect(saved).toHaveLength(2);
  // Both captures came from the same page, so the shared context is filled.
  expect(new Set(saved.map((record) => record.url))).toEqual(
    new Set(["https://example.com/article"]),
  );
});

test("record_card_shows_the_attachment_or_the_placeholder", async () => {
  const dash = await harness.open("/assets");
  await openAssets(dash);

  const card = dash.getByTestId("asset-card").filter({ hasText: "视频帧" });
  await card.getByRole("button", { name: "存为记录" }).click();
  await expect(dash.getByText("已存为 1 条记录")).toBeVisible();

  await dash.goto(`${dash.url().replace(/#.*$/, "#")}/highlights`);
  await dash.waitForSelector('[data-testid="record-attachment"]');

  const attachment = dash.getByTestId("record-attachment").first();
  // The badge says what it is, and a video frame carries its position.
  await expect(attachment).toContainText("视频帧");
  await expect(attachment.locator("img")).toHaveAttribute(
    "src",
    /^data:image\/png/,
  );
  await expect(attachment).not.toContainText("图片在本机");
});

test("record_card_falls_back_when_the_attachment_is_not_on_this_device", async () => {
  const dash = await harness.open("/assets");
  await resetRecords(dash);

  // A record synced from another device: it keeps the reference, but this
  // device has no bytes for it.
  await send(dash, "myz:saveHighlight", {
    kind: "clip",
    text: "synced capture",
    url: "https://example.com/elsewhere",
    sourceUrl: "https://example.com/elsewhere",
    title: "Synced capture",
    hostname: "example.com",
    attachments: [
      { assetId: "asset-not-here", mime: "image/png", width: 10, height: 10 },
    ],
  });

  await dash.goto(`${dash.url().replace(/#.*$/, "#")}/highlights`);
  await dash.waitForSelector('[data-testid="record-attachment"]');

  const attachment = dash.getByTestId("record-attachment").first();
  await expect(attachment).toContainText("图片在本机");
  await expect(attachment.locator("img")).toHaveCount(0);
});
