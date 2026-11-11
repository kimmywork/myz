import { test, expect } from "@playwright/test";
import path from "node:path";
import { send, setupDashboardHarness } from "../helpers/dashboard-harness.js";
import { dirnameFromImportMeta } from "../helpers/runtime.js";

const __dirname = dirnameFromImportMeta(import.meta.url);
const harness = setupDashboardHarness();

/** Fails the test if the browser's native dialog ever appears. */
function trackNativeDialog(page: import("@playwright/test").Page) {
  const seen: string[] = [];
  page.on("dialog", (dialog) => {
    seen.push(dialog.type());
    void dialog.dismiss();
  });
  return seen;
}

test("overwrite_import_confirms_with_the_themed_popover", async () => {
  const dash = await harness.open("/settings/import");
  const nativeDialogs = trackNativeDialog(dash);
  await dash.waitForSelector(".settings__group", { timeout: 8000 });

  const jsonFile = path.join(
    __dirname,
    "..",
    "fixtures",
    "import",
    "myz-import.json",
  );
  await dash.setInputFiles('input[type="file"]', jsonFile);
  await dash.selectOption('[data-testid="import-strategy"]', "overwrite");
  await dash.click('button:has-text("开始导入")');

  const popover = dash.locator(".myz-confirm");
  await expect(popover).toBeVisible();
  await expect(popover).toContainText("覆盖策略");
  await expect(popover).toHaveAttribute("role", "alertdialog");
  expect(nativeDialogs).toEqual([]);

  await popover.getByRole("button", { name: "确定" }).click();
  await dash.waitForFunction(
    () => {
      const el = document.querySelector(".status-line");
      return !!el && /导入完成/.test((el as HTMLElement).textContent || "");
    },
    undefined,
    { timeout: 8000 },
  );
});

test("clearing_the_capture_cache_confirms_with_the_themed_popover", async () => {
  const dash = await harness.open("/settings/import");
  const nativeDialogs = trackNativeDialog(dash);
  await send(dash, "myz:stageAsset", {
    name: "confirm.png",
    mime: "image/png",
    width: 1,
    height: 1,
    dataUrl:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    thumb:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    sourceKind: "screenshot",
    size: 68,
  });

  const stitch = await harness.context().newPage();
  await stitch.goto(
    `chrome-extension://${harness.extensionId()}/src/stitch/stitch.html`,
  );
  await stitch.waitForSelector(".staging", { timeout: 10000 });

  const clear = stitch.getByRole("button", { name: "清空" });
  await expect(clear).toBeEnabled();
  await clear.click();

  const popover = stitch.locator(".myz-confirm");
  await expect(popover).toBeVisible();
  await expect(popover).toContainText("清空缓存区");
  expect(nativeDialogs).toEqual([]);

  await popover.getByRole("button", { name: "确定" }).click();
  await expect(stitch.locator(".staging-item")).toHaveCount(0);
  await stitch.close();
});

test("reader_annotated_delete_confirms_with_the_themed_popover", async () => {
  const dash = await harness.open("/settings/import");
  const nativeDialogs = trackNativeDialog(dash);

  const epub = await harness.context().newPage();
  await epub.goto(
    `chrome-extension://${harness.extensionId()}/src/epub/epub-viewer.html`,
  );
  await epub.waitForFunction(() => Boolean((window as any).__MYZ_EPUB__));
  await epub.evaluate(
    (url) => (window as any).__MYZ_EPUB__.openUrl(url),
    `${harness.serverUrl()}/epub/sample.epub`,
  );
  await epub.waitForFunction(
    () => (window as any).__MYZ_EPUB__.getState().status === "ready",
  );
  const created = await epub.evaluate(() =>
    (window as any).__MYZ_EPUB__.createHighlightByText(
      "Alpha body text",
      "highlight",
    ),
  );
  expect(created).toBe(true);

  const frame = epub.frameLocator(".epub-frame");
  await frame.locator("mark.myz-highlight").first().click();
  const panel = epub.locator(".reader-inspector");
  await expect(panel).toBeVisible();
  await panel.locator(".reader-inspector__note").fill("保留这段批注");
  await panel.getByRole("button", { name: "保存" }).click();

  await panel.getByRole("button", { name: "删除" }).click();
  const popover = epub.locator(".myz-confirm");
  await expect(popover).toBeVisible();
  await expect(popover).toContainText("批注");
  expect(nativeDialogs).toEqual([]);
  await popover.getByRole("button", { name: "取消" }).click();
  await expect(popover).toHaveCount(0);
  await epub.close();
});
