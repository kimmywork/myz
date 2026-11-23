import { test, expect } from "@playwright/test";
import { setupDashboardHarness } from "../helpers/dashboard-harness.js";

const harness = setupDashboardHarness();

test("settings_modal_height_is_stable_across_sections", async () => {
  const dash = await harness.open("/highlights");
  await dash.getByTestId("rail-settings").click();
  const dialog = dash.getByRole("dialog");
  await expect(dialog).toBeVisible();

  const heightOf = () =>
    dialog.evaluate((el) => Math.round(el.getBoundingClientRect().height));

  const short = await heightOf();
  // The tallest section must not grow the frame…
  await dash.getByTestId("settings-nav-ai").click();
  const tall = await heightOf();
  expect(tall).toBe(short);
  // …and a short one must not shrink it.
  await dash.getByTestId("settings-nav-highlight-preferences").click();
  expect(await heightOf()).toBe(short);
});

test("settings_detail_scrolls_without_dragging_the_nav", async () => {
  const dash = await harness.open("/highlights");
  await dash.getByTestId("rail-settings").click();
  await dash.getByTestId("settings-nav-ai").click();

  const nav = dash.getByTestId("settings-nav-pane");
  const detail = dash.getByTestId("settings-detail-pane");

  // The detail pane owns its own scroll: AI 解读 overflows it…
  const scrollable = await detail.evaluate((el) => ({
    top: el.scrollTop,
    overflow: el.scrollHeight > el.clientHeight,
  }));
  expect(scrollable.overflow).toBe(true);

  // …and scrolling it leaves the nav pane exactly where it was.
  await detail.evaluate((el) => {
    el.scrollTop = 240;
  });
  await dash.waitForTimeout(50);
  expect(await detail.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await nav.evaluate((el) => el.scrollTop)).toBe(0);
});
