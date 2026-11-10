import { test, expect } from "@playwright/test";
import { setupDashboardHarness } from "../helpers/dashboard-harness.js";

const harness = setupDashboardHarness();

const NAV = '[data-testid="workspace-nav"]';
const HANDLE = '[data-testid="workspace-nav-handle"]';

async function navWidth(page: import("@playwright/test").Page) {
  return page.$eval(NAV, (el) => Math.round(el.getBoundingClientRect().width));
}

async function shellWidth(page: import("@playwright/test").Page) {
  return page.$eval(
    HANDLE,
    (el) => Number(el.getAttribute("aria-valuenow")) || 0,
  );
}

test("workspace_shell_drag_keyboard_and_persistence", async () => {
  const dash = await harness.open("/inbox");
  await dash.waitForSelector('[data-testid="workspace-shell"]');
  expect(await navWidth(dash)).toBe(240);
  expect(await shellWidth(dash)).toBe(240);

  const box = await dash.locator(HANDLE).boundingBox();
  if (!box) throw new Error("resize handle has no box");
  await dash.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await dash.mouse.down();
  await dash.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, {
    steps: 5,
  });
  await dash.mouse.up();
  expect(await navWidth(dash)).toBe(280);
  expect(await shellWidth(dash)).toBe(280);

  // Dragging past the clamp does not grow beyond 320.
  const again = await dash.locator(HANDLE).boundingBox();
  if (!again) throw new Error("resize handle has no box");
  await dash.mouse.move(again.x + again.width / 2, again.y + again.height / 2);
  await dash.mouse.down();
  await dash.mouse.move(
    again.x + again.width / 2 + 400,
    again.y + again.height / 2,
    {
      steps: 5,
    },
  );
  await dash.mouse.up();
  expect(await navWidth(dash)).toBe(320);

  await dash.reload();
  await dash.waitForSelector('[data-testid="workspace-shell"]');
  expect(await navWidth(dash)).toBe(320);

  await dash.locator(HANDLE).focus();
  await dash.keyboard.press("Home");
  expect(await navWidth(dash)).toBe(240);
  await dash.keyboard.press("ArrowLeft");
  expect(await navWidth(dash)).toBe(232);
  await dash.keyboard.press("Enter");
  // Collapsed column is 0; the 1px border still reports as box width.
  expect(await shellWidth(dash)).toBe(0);
  expect(await navWidth(dash)).toBeLessThanOrEqual(1);
  await dash.keyboard.press("Enter");
  expect(await navWidth(dash)).toBe(240);
});

test("workspace_shell_breakpoints_900_and_640", async () => {
  const dash = await harness.open("/inbox");
  await dash.waitForSelector('[data-testid="workspace-shell"]');

  // 900: inline nav with the drag handle still present.
  await dash.setViewportSize({ width: 900, height: 900 });
  expect(await navWidth(dash)).toBe(240);
  await expect(dash.locator(HANDLE)).toBeVisible();
  await expect(dash.locator('[data-testid="bottom-nav-inbox"]')).toBeHidden();

  // 880: nav becomes a drawer opened from the page's own filter button.
  await dash.setViewportSize({ width: 880, height: 900 });
  await expect(dash.locator(NAV)).toBeHidden();
  await dash.getByRole("button", { name: "筛选 / 标签" }).click();
  await expect(dash.locator(NAV)).toBeVisible();
  expect(await navWidth(dash)).toBe(240);
  await dash.keyboard.press("Escape");
  await expect(dash.locator(NAV)).toBeHidden();

  // 620: rail gives way to the bottom bar.
  await dash.setViewportSize({ width: 620, height: 900 });
  await expect(dash.locator('[data-testid="rail-highlights"]')).toBeHidden();
  await expect(dash.locator('[data-testid="bottom-nav-inbox"]')).toBeVisible();
  await dash.locator('[data-testid="bottom-nav-highlights"]').click();
  await expect(dash).toHaveURL(/#\/highlights/);
  await expect(dash.locator('[data-testid="workspace-shell"]')).toBeVisible();
});
