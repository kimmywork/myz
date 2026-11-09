import { test, expect, BrowserContext, Page } from "@playwright/test";
import { Server } from "node:http";
import path from "node:path";
import { launchExtension } from "../helpers/launch-extension.js";
import { dirnameFromImportMeta } from "../helpers/runtime.js";
import { createStaticServer } from "../helpers/static-server.js";

const __dirname = dirnameFromImportMeta(import.meta.url);
const WINDOW_MS = 6000;

let server: Server;
let serverUrl: string;
let context: BrowserContext;
let page: Page;
let extensionId: string | null;
let dialogCount = 0;

test.beforeAll(async () => {
  const fixtures = path.join(__dirname, "..", "fixtures");
  const s = createStaticServer(fixtures);
  const listen = await s.listen(0);
  server = listen.server;
  serverUrl = listen.url;

  const extensionPath = path.join(__dirname, "..", "..", "dist");
  const launched = await launchExtension(extensionPath);
  context = launched.context;
  page = launched.page;
  extensionId = launched.extensionId;
  page.on("dialog", (dialog) => {
    dialogCount += 1;
    void dialog.dismiss();
  });
});

test.afterAll(async () => {
  await context.close();
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

/** Deletes every stored record so each case starts from an empty library. */
async function clearRecords() {
  if (!extensionId) throw new Error("extension id unavailable");
  const ext = await context.newPage();
  await ext.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
  await ext.evaluate(async () => {
    const all = (await chrome.runtime.sendMessage({
      type: "myz:getAllHighlights",
    })) as { data?: { id?: string }[] } | undefined;
    const ids = (all?.data ?? [])
      .map((record) => record.id)
      .filter((id): id is string => Boolean(id));
    if (ids.length) {
      await chrome.runtime.sendMessage({
        type: "myz:removeRecordsByIds",
        payload: { ids },
      });
    }
  });
  await ext.close();
}

test.beforeEach(async () => {
  dialogCount = 0;
  await clearRecords();
  await page.goto(`${serverUrl}/myz-test.html`);
  await page.waitForSelector("[data-myz-host='1']", {
    state: "attached",
    timeout: 8000,
  });
});

/** Creates a highlight in `selector`; `note` switches the inspector panel. */
async function createHighlight(selector: string, note?: string) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`no bounding box for ${selector}`);
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + Math.min(box.width - 10, 160), box.y + 10);
  await page.mouse.up();
  await page.waitForSelector(".myz-annotator-toolbar:not(.myz-hidden)", {
    timeout: 8000,
  });
  await page.click('.myz-annotator-toolbar button[aria-label="划线"]');
  await page.waitForSelector(".myz-annotator-modal:not(.myz-hidden)", {
    timeout: 8000,
  });
  if (note) {
    await page.fill(".myz-annotator-modal textarea", note);
  }
  await page.click(".myz-annotator-modal .myz-btn-primary");
  await page.waitForSelector(`${selector} .myz-highlight`, { timeout: 5000 });
}

async function openInspector(selector: string) {
  await page.locator(`${selector} .myz-highlight`).first().click();
  await page.waitForSelector(".myz-inspector:not(.myz-hidden)", {
    timeout: 5000,
  });
}

async function shadowActiveLabel() {
  return page.evaluate(() => {
    const host = document.querySelector("[data-myz-host='1']");
    const el = host?.shadowRoot?.activeElement as HTMLElement | null;
    if (!el) return null;
    return el.getAttribute("aria-label") ?? el.textContent?.trim() ?? null;
  });
}

test("无批注的划线直接删除并可以撤销，不弹原生 confirm", async () => {
  await createHighlight("#para-2");
  await openInspector("#para-2");
  await expect(page.locator(".myz-inspector--toolbar")).toHaveCount(1);

  await page.click(".myz-inspector__icon-btn--delete");

  // No confirmation popup, no native dialog: the compact bar has no note to
  // lose, so the toast is the only guard.
  await expect(page.locator(".myz-confirm")).toHaveCount(0);
  await expect(page.locator("#para-2 .myz-highlight")).toHaveCount(0, {
    timeout: 1000,
  });
  await expect(page.locator(".myz-inspector")).toHaveClass(/myz-hidden/);

  const toast = page.locator(".myz-toast").filter({ hasText: "已删除划线" });
  await expect(toast).toHaveCount(1);
  await expect(toast).toHaveAttribute("role", "status");
  await expect(toast).toHaveAttribute("aria-live", "polite");
  await expect(toast.locator(".myz-toast__action")).toHaveText("撤销");

  await page.waitForTimeout(300);
  expect(dialogCount).toBe(0);

  await toast.locator(".myz-toast__action").click();
  await expect(toast).toHaveCount(0, { timeout: 1000 });
  await expect(page.locator("#para-2 .myz-highlight")).toHaveCount(1, {
    timeout: 1000,
  });

  // Undo restored in place and storage never saw the delete.
  await page.reload({ waitUntil: "load" });
  await expect(page.locator("#para-2 .myz-highlight")).toHaveCount(1, {
    timeout: 8000,
  });
});

test("有批注的划线先弹确认 popup，三种关法都只关 popup", async () => {
  await createHighlight("#para-1", "这条划线的批注");
  await openInspector("#para-1");
  await expect(page.locator(".myz-inspector--toolbar")).toHaveCount(0);

  const popup = page.locator(".myz-confirm");

  // Escape closes only the popup and returns focus to the delete button.
  await page.click(".myz-inspector__icon-btn--delete");
  await expect(popup).toHaveCount(1);
  await expect(popup).toHaveAttribute("role", "alertdialog");
  await expect(popup.locator(".myz-confirm__title")).toHaveText("删除划线？");
  await expect(page.locator(".myz-inspector")).not.toHaveClass(/myz-hidden/);
  expect(await shadowActiveLabel()).toBe("取消");

  await page.keyboard.press("Tab");
  expect(await shadowActiveLabel()).toBe("删除");
  await page.keyboard.press("Tab");
  expect(await shadowActiveLabel()).toBe("取消");

  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(page.locator(".myz-inspector")).not.toHaveClass(/myz-hidden/);
  expect(await shadowActiveLabel()).toBe("删除划线");
  await expect(page.locator(".myz-inspector--toolbar")).toHaveCount(0);

  // Cancel button.
  await page.click(".myz-inspector__icon-btn--delete");
  await expect(popup).toHaveCount(1);
  await popup.locator(".myz-btn-secondary").click();
  await expect(popup).toHaveCount(0);
  await expect(page.locator(".myz-inspector")).not.toHaveClass(/myz-hidden/);
  expect(await shadowActiveLabel()).toBe("删除划线");

  // Click outside.
  await page.click(".myz-inspector__icon-btn--delete");
  await expect(popup).toHaveCount(1);
  await page.mouse.click(8, 8);
  await expect(popup).toHaveCount(0);
  await expect(page.locator(".myz-inspector")).not.toHaveClass(/myz-hidden/);

  expect(dialogCount).toBe(0);
});

test("确认后延迟提交：撤销窗口内刷新仍在，窗口后刷新消失", async () => {
  await createHighlight("#para-1", "延迟提交");
  await openInspector("#para-1");
  await page.click(".myz-inspector__icon-btn--delete");
  await page.locator(".myz-confirm .myz-btn-danger").click();

  await expect(page.locator("#para-1 .myz-highlight")).toHaveCount(0, {
    timeout: 1000,
  });
  await expect(page.locator(".myz-inspector")).toHaveClass(/myz-hidden/);
  const deleteToast = page
    .locator(".myz-toast")
    .filter({ hasText: "已删除划线" });
  await expect(deleteToast).toHaveCount(1);

  // Inside the window the storage write has not happened yet.
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: "load" });
  await expect(page.locator("#para-1 .myz-highlight")).toHaveCount(1, {
    timeout: 8000,
  });

  // Past the window the delete is committed.
  await openInspector("#para-1");
  await page.click(".myz-inspector__icon-btn--delete");
  await page.locator(".myz-confirm .myz-btn-danger").click();
  await expect(deleteToast).toHaveCount(0, {
    timeout: WINDOW_MS + 3000,
  });
  // The commit takes its own toast down; no dead "撤销" stays clickable.
  await expect(page.locator(".myz-toast__action")).toHaveCount(0);
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector("[data-myz-host='1']", {
    state: "attached",
    timeout: 8000,
  });
  await expect(page.locator("#para-1 .myz-highlight")).toHaveCount(0, {
    timeout: 3000,
  });
});

test("悬停撤销按钮会冻结提交，超过窗口也不删", async () => {
  await createHighlight("#para-2", "悬停暂停");
  await openInspector("#para-2");
  await page.click(".myz-inspector__icon-btn--delete");
  await page.locator(".myz-confirm .myz-btn-danger").click();

  const toast = page.locator(".myz-toast").filter({ hasText: "已删除划线" });
  await expect(toast).toHaveCount(1);
  // Wait for the "已保存" toast to finish: when it disappears the stack shifts
  // up, which would move the pointer off the undo button and resume early.
  await expect(page.locator(".myz-toast")).toHaveCount(1);
  await toast.locator(".myz-toast__action").hover();

  // Well past the window: the toast must still be there and the write held,
  // otherwise the visible undo button would do nothing.
  await page.waitForTimeout(WINDOW_MS + 1500);
  await expect(toast).toHaveCount(1);

  await toast.locator(".myz-toast__action").click();
  await expect(toast).toHaveCount(0, { timeout: 1000 });
  await expect(page.locator("#para-2 .myz-highlight")).toHaveCount(1, {
    timeout: 1000,
  });

  // Storage never saw the delete, so the record survives a reload.
  await page.reload({ waitUntil: "load" });
  await expect(page.locator("#para-2 .myz-highlight")).toHaveCount(1, {
    timeout: 8000,
  });
});

test("确认后撤销：通知条立即消失、划线就地恢复", async () => {
  await createHighlight("#para-2", "撤销恢复");
  await openInspector("#para-2");
  await page.click(".myz-inspector__icon-btn--delete");
  await page.locator(".myz-confirm .myz-btn-danger").click();

  await expect(page.locator("#para-2 .myz-highlight")).toHaveCount(0, {
    timeout: 1000,
  });
  const toast = page.locator(".myz-toast").filter({ hasText: "已删除划线" });
  await expect(toast).toHaveCount(1);

  await toast.locator(".myz-toast__action").click();
  await expect(toast).toHaveCount(0, { timeout: 1000 });
  await expect(page.locator("#para-2 .myz-highlight")).toHaveCount(1, {
    timeout: 1000,
  });

  // The record never left storage, so a reload still shows it.
  await page.reload({ waitUntil: "load" });
  await expect(page.locator("#para-2 .myz-highlight")).toHaveCount(1, {
    timeout: 8000,
  });
});

test("连续删两条：撤销前一条不影响另一条", async () => {
  await createHighlight("#para-1", "第一条");
  await createHighlight("#para-2", "第二条");

  await openInspector("#para-1");
  await page.click(".myz-inspector__icon-btn--delete");
  await page.locator(".myz-confirm .myz-btn-danger").click();
  await expect(page.locator("#para-1 .myz-highlight")).toHaveCount(0, {
    timeout: 1000,
  });

  await openInspector("#para-2");
  await page.click(".myz-inspector__icon-btn--delete");
  await page.locator(".myz-confirm .myz-btn-danger").click();
  await expect(page.locator("#para-2 .myz-highlight")).toHaveCount(0, {
    timeout: 1000,
  });

  const toasts = page.locator(".myz-toast").filter({ hasText: "已删除划线" });
  await expect(toasts).toHaveCount(2);

  // The first toast belongs to #para-1: undoing it leaves the second alone.
  await toasts.nth(0).locator(".myz-toast__action").click();
  await expect(page.locator("#para-1 .myz-highlight")).toHaveCount(1, {
    timeout: 1000,
  });
  await expect(page.locator("#para-2 .myz-highlight")).toHaveCount(0);

  // Let the second delete commit, then reload.
  await expect(toasts).toHaveCount(0, { timeout: WINDOW_MS + 4000 });
  await page.reload({ waitUntil: "load" });
  await expect(page.locator("#para-1 .myz-highlight")).toHaveCount(1, {
    timeout: 8000,
  });
  await expect(page.locator("#para-2 .myz-highlight")).toHaveCount(0);
});
