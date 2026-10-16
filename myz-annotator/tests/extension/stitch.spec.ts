import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  makePngDataUrl,
  send,
  setupStitchHarness,
  waitForStagedCount,
} from "../helpers/stitch-harness.js";

const harness = setupStitchHarness();

function stagePng(
  page: Page,
  dataUrl: string,
  name: string,
  sourceKind = "image",
) {
  return send<{ id: string }>(page, "myz:stageAsset", {
    dataUrl,
    name,
    mime: "image/png",
    width: 8,
    height: 6,
    sourceKind,
  });
}

test("staging_cache_crud_roundtrip", async () => {
  const stitch = await harness.openStitch();
  await send(stitch, "myz:clearStagedAssets");
  const dataUrl = await makePngDataUrl(stitch);

  const staged = await stagePng(stitch, dataUrl, "unit");
  expect(staged?.id).toBeTruthy();

  const list = await send<Array<{ id: string }>>(
    stitch,
    "myz:listStagedAssets",
  );
  expect(list.length).toBe(1);

  const full = await send<{ dataUrl?: string } | null>(
    stitch,
    "myz:getStagedAsset",
    { id: staged.id },
  );
  expect(full?.dataUrl).toBe(dataUrl);

  await send(stitch, "myz:deleteStagedAsset", { id: staged.id });
  const after = await send<Array<unknown>>(stitch, "myz:listStagedAssets");
  expect(after.length).toBe(0);
});

test("stitch_editor_imports_cache_and_switches_modes", async () => {
  const stitch = await harness.openStitch();
  await send(stitch, "myz:clearStagedAssets");
  const dataUrl = await makePngDataUrl(stitch);
  await stagePng(stitch, dataUrl, "a");
  await stagePng(stitch, dataUrl, "b");

  await stitch.reload();
  await stitch.waitForSelector(".staging-item", { timeout: 8000 });
  expect(await stitch.locator(".staging-item").count()).toBe(2);

  await stitch.getByRole("button", { name: "全选" }).click();
  await stitch.getByRole("button", { name: /导入所选/ }).click();

  await stitch.waitForSelector(".tray-item", { timeout: 8000 });
  expect(await stitch.locator(".tray-item").count()).toBe(2);
  await stitch.waitForSelector(".stage-canvas", { timeout: 8000 });

  await stitch.getByRole("tab", { name: "拼图" }).click();
  await stitch.waitForSelector(".stage-canvas");
  await stitch.getByRole("tab", { name: "展示图" }).click();
  await stitch.waitForSelector(".stage-canvas");
});

test("selection_screenshot_stages_and_names", async () => {
  const stitch = await harness.openStitch();
  await send(stitch, "myz:clearStagedAssets");

  const page = await harness.context().newPage();
  await page.goto(`${harness.serverUrl()}/myz-test.html`);
  const para = page.locator("p").first();
  const box = await para.boundingBox();
  if (!box) throw new Error("Could not determine paragraph bounding box");
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 10, box.y + 10);
  await page.mouse.up();

  await page.waitForSelector(".myz-annotator-toolbar:not(.myz-hidden)", {
    timeout: 5000,
  });
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 10000 }),
    page.click('.myz-annotator-toolbar button[aria-label="截取"]'),
  ]);
  expect(download.suggestedFilename()).toMatch(/^myz-screenshot-.+\.png$/);

  const list = await waitForStagedCount(stitch, 1);
  expect(list[0].sourceKind).toBe("screenshot");
  expect(String(list[0].name)).toMatch(/^myz-screenshot-.+\.png$/);
});

test("video_frame_button_captures_current_frame", async () => {
  const stitch = await harness.openStitch();
  await send(stitch, "myz:clearStagedAssets");

  const page = await harness.context().newPage();
  await page.goto(`${harness.serverUrl()}/video-capture.html`);
  await page.waitForFunction(
    () => {
      const video = document.querySelector("video");
      return !!video && video.videoWidth > 0 && video.readyState >= 2;
    },
    null,
    { timeout: 25000 },
  );

  const box = await page.locator("video").boundingBox();
  if (!box) throw new Error("Could not determine video bounding box");
  // Move to the video's top-right corner to reveal the floating button.
  await page.mouse.move(box.x + box.width - 20, box.y + 20);

  const button = page.locator(".myz-video-capture");
  await button.waitFor({ state: "visible", timeout: 5000 });
  await button.click();

  const list = await waitForStagedCount(stitch, 1);
  expect(list[0].sourceKind).toBe("video-frame");
  expect(String(list[0].name)).toMatch(/^myz-video-.+\.png$/);
});

test("stitch_editor_exports_with_expected_filenames", async () => {
  const stitch = await harness.openStitch();
  await send(stitch, "myz:clearStagedAssets");
  const dataUrl = await makePngDataUrl(stitch);
  await stagePng(stitch, dataUrl, "a");
  await stagePng(stitch, dataUrl, "b");

  await stitch.reload();
  await stitch.waitForSelector(".staging-item", { timeout: 8000 });
  await stitch.getByRole("button", { name: "全选" }).click();
  await stitch.getByRole("button", { name: /导入所选/ }).click();
  await stitch.waitForSelector(".stage-canvas", { timeout: 8000 });

  const modes: Array<[string, string]> = [
    ["截图拼接", "myz-stitch"],
    ["拼图", "myz-collage"],
    ["展示图", "myz-showcase"],
  ];
  for (const [tab, prefix] of modes) {
    if (tab !== "截图拼接") {
      await stitch.getByRole("tab", { name: tab }).click();
      await stitch.waitForSelector(".stage-canvas");
    }
    const save = stitch.getByRole("button", { name: "保存图片" }).first();
    await expect(save).toBeEnabled({ timeout: 10000 });
    const [download] = await Promise.all([
      stitch.waitForEvent("download", { timeout: 15000 }),
      save.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(
      new RegExp(`^${prefix}-.+\\.png$`),
    );
  }
});

// Opt-in: exercises a real remote player. Off by default because it needs
// network access and the player markup can change. Run with:
//   MYZ_REMOTE_VIDEO=1 npx playwright test tests/extension/stitch.spec.ts
test("video_frame_button_on_remote_player", async () => {
  test.skip(
    !process.env.MYZ_REMOTE_VIDEO,
    "set MYZ_REMOTE_VIDEO=1 to test against a remote video",
  );
  const stitch = await harness.openStitch();
  await send(stitch, "myz:clearStagedAssets");

  const page = await harness.context().newPage();
  await page.goto("https://www.bilibili.com/video/BV1GJ411x7h7/", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  const video = page.locator("video").first();
  await video.waitFor({ state: "visible", timeout: 20000 });
  await page.waitForFunction(
    () => {
      const el = document.querySelector("video");
      return !!el && el.videoWidth > 0;
    },
    null,
    { timeout: 20000 },
  );

  const box = await video.boundingBox();
  if (!box) throw new Error("Could not determine remote video bounding box");
  await page.mouse.move(box.x + box.width - 20, box.y + 20);
  const button = page.locator(".myz-video-capture");
  await button.waitFor({ state: "visible", timeout: 5000 });
  await button.click();

  const list = await waitForStagedCount(stitch, 1);
  expect(list[0].sourceKind).toBe("video-frame");
});
