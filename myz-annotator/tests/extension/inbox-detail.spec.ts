import { test, expect } from "@playwright/test";
import { setupDashboardHarness } from "../helpers/dashboard-harness.js";

const harness = setupDashboardHarness();

async function saveSeed(
  dash: import("@playwright/test").Page,
  text: string,
  options: { note?: string; tags?: string[] } = {},
) {
  const canonical = `${harness.serverUrl()}/myz-test.html`;
  await dash.evaluate(
    (payload) =>
      new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: "myz:saveHighlight", payload },
          (resp) => {
            if (chrome.runtime.lastError) {
              return reject(new Error(chrome.runtime.lastError.message));
            }
            resolve(resp);
          },
        );
      }),
    {
      url: canonical,
      sourceUrl: canonical,
      title: `详情 ${text}`,
      text,
      html: `<p>${text}</p>`,
      note: options.note ?? "",
      tags: options.tags ?? [],
      hostname: new URL(canonical).hostname,
      kind: "clip",
    },
  );
}

async function seedTwo(dash: import("@playwright/test").Page) {
  await saveSeed(dash, "panel alpha", { note: "alpha 批注", tags: ["work"] });
  await saveSeed(dash, "panel beta");
  await dash.reload();
  await dash.waitForSelector('[data-testid="inbox-row"]', { timeout: 10000 });
}

async function activeTestId(dash: import("@playwright/test").Page) {
  return dash.evaluate(() =>
    document.activeElement?.getAttribute("data-testid"),
  );
}

test("row_click_opens_the_detail_panel_and_esc_restores_focus", async () => {
  const dash = await harness.open("/inbox");
  await seedTwo(dash);

  await expect(dash.locator('[data-testid="inbox-detail"]')).toHaveCount(0);
  const row = dash.locator('[data-testid="inbox-row"]', {
    hasText: "panel alpha",
  });
  // Click the title, not the row centre: hover reveals the action cluster
  // there, and those buttons are the point of hover-only actions.
  await row.locator(".myz-list-row__title").click();

  const panel = dash.locator('[data-testid="workspace-panel"]');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("原文");
  await expect(panel).toContainText("alpha 批注");
  await expect(panel).toContainText("work");
  await expect(panel).toContainText("来源");
  await expect(panel).toContainText("myz-test");

  // The clicked row keeps focus so the overlay can return it.
  expect(await activeTestId(dash)).toBe("inbox-row");

  await dash.keyboard.press("Escape");
  await expect(dash.locator('[data-testid="inbox-detail"]')).toHaveCount(0);
  expect(await activeTestId(dash)).toBe("inbox-row");

  // The batch checkbox never opens the detail.
  await dash
    .locator('[data-testid="inbox-row"]', { hasText: "panel beta" })
    .getByRole("checkbox")
    .check();
  await expect(dash.locator('[data-testid="inbox-detail"]')).toHaveCount(0);
});

test("panel_is_an_overlay_below_1200_and_a_bottom_sheet_below_640", async () => {
  const dash = await harness.open("/inbox");
  await seedTwo(dash);
  const row = dash.locator('[data-testid="inbox-row"]').first();

  await dash.setViewportSize({ width: 1100, height: 900 });
  await row.locator(".myz-list-row__title").click();
  const panel = dash.locator('[data-testid="workspace-panel"]');
  await expect(panel).toBeVisible();
  const wideBox = await panel.boundingBox();
  if (!wideBox) throw new Error("panel has no box");
  expect(Math.round(wideBox.x + wideBox.width)).toBeGreaterThanOrEqual(1096);
  expect(wideBox.height).toBeGreaterThanOrEqual(890);
  await expect(dash.locator(".myz-workspace__panel-backdrop")).toBeVisible();
  await dash.keyboard.press("Escape");
  await expect(panel).toBeHidden();

  await dash.setViewportSize({ width: 620, height: 900 });
  await row.locator(".myz-list-row__title").click();
  await expect(panel).toBeVisible();
  const sheetBox = await panel.boundingBox();
  if (!sheetBox) throw new Error("sheet has no box");
  expect(Math.round(sheetBox.y + sheetBox.height)).toBeGreaterThanOrEqual(896);
  expect(sheetBox.height).toBeLessThanOrEqual(900 * 0.7 + 2);
  await dash.locator(".myz-workspace__panel-backdrop").click();
  await expect(panel).toBeHidden();
});
