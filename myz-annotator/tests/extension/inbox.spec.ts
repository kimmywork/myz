import { test, expect, BrowserContext } from "@playwright/test";
import { Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchExtension } from "../helpers/launch-extension.js";
import { createStaticServer } from "../helpers/static-server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe.configure({ retries: 1 });

let server: Server;
let serverUrl: string;
let context: BrowserContext;
let extensionId: string | null;

test.beforeAll(async () => {
  const fixtures = path.join(__dirname, "..", "fixtures");
  const s = createStaticServer(fixtures);
  const listen = await s.listen(0);
  server = listen.server;
  serverUrl = listen.url;

  const extensionPath = path.join(__dirname, "..", "..", "dist");
  const launched = await launchExtension(extensionPath);
  context = launched.context;
  extensionId = launched.extensionId;
  if (!extensionId) {
    throw new Error("Could not determine extension id (extensionId is null).");
  }
});

test.afterAll(async () => {
  await context.close();
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

async function saveClip(
  page: Awaited<ReturnType<BrowserContext["newPage"]>>,
  text: string,
  tags: string[] = [],
) {
  const canonical = `${serverUrl}/myz-test.html`;
  return page.evaluate<{ ok: boolean }>(
    async (p) =>
      new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: "myz:saveHighlight", payload: p },
          (resp) => {
            if (chrome.runtime.lastError)
              return reject(new Error(chrome.runtime.lastError.message));
            resolve(resp);
          },
        );
      }),
    {
      url: canonical,
      sourceUrl: canonical,
      title: `Inbox ${text}`,
      text,
      html: `<p>${text}</p>`,
      note: "",
      tags,
      hostname: new URL(canonical).hostname,
      kind: "clip",
    },
  );
}

test("inbox_triage_focus_mode_undo_and_delete", async () => {
  const dashboardUrl = `chrome-extension://${extensionId}/src/dashboard/index.html`;
  const dash = await context.newPage();
  await dash.goto(dashboardUrl);
  await dash.waitForSelector(".app-shell", { timeout: 5000 });

  await saveClip(dash, "inbox alpha");
  await saveClip(dash, "inbox beta");

  await dash.goto(`${dashboardUrl}#/inbox`);
  await dash.reload();
  await dash.waitForSelector('[data-testid="inbox-row"]', { timeout: 5000 });
  await expect(dash.locator('[data-testid="inbox-row"]')).toHaveCount(2);

  // Keep the first row, then undo within the 5s window.
  await dash
    .locator('[data-testid="inbox-row"]')
    .first()
    .getByRole("button", { name: /保留/ })
    .click();
  const undoButton = dash.getByRole("button", { name: "撤销" });
  await expect(undoButton).toBeVisible();
  await undoButton.click();
  await expect(dash.locator('[data-testid="inbox-row"]')).toHaveCount(2);

  // Focus mode: K keeps the current item and auto-advances.
  await dash.getByRole("button", { name: "专注处理" }).click();
  await expect(dash.locator('[data-testid="inbox-focus"]')).toBeVisible();
  await expect(dash.getByText("1 / 2")).toBeVisible({ timeout: 10_000 });
  await dash.keyboard.press("k");
  await expect(dash.getByText("1 / 1")).toBeVisible({ timeout: 10_000 });
  await dash.keyboard.press("k");
  await expect(dash.getByText("队列已清空")).toBeVisible({ timeout: 10_000 });
});

test("inbox_focus_mode_ignores_typing_and_esc_exits", async () => {
  const dashboardUrl = `chrome-extension://${extensionId}/src/dashboard/index.html`;
  const dash = await context.newPage();
  let dialogFired = false;
  dash.on("dialog", (dialog) => {
    dialogFired = true;
    void dialog.dismiss();
  });
  await dash.goto(dashboardUrl);
  await dash.waitForSelector(".app-shell", { timeout: 5000 });

  await saveClip(dash, "typing alpha");
  await saveClip(dash, "typing beta");
  await dash.goto(`${dashboardUrl}#/inbox`);
  await dash.reload();
  await dash.waitForSelector('[data-testid="inbox-row"]', { timeout: 5000 });

  await dash.getByRole("button", { name: "专注处理" }).click();
  await expect(dash.locator('[data-testid="inbox-focus"]')).toBeVisible();

  const search = dash.getByPlaceholder("搜索原文、批注、标题、标签、来源");
  await search.click();
  await search.type("ad");
  await expect(search).toHaveValue("ad");
  expect(dialogFired).toBe(false);

  await dash.keyboard.press("Escape");
  await expect(dash.locator('[data-testid="inbox-focus"]')).toBeHidden();

  // Clearing the query, both clips are still in the queue (no action fired).
  await search.fill("");
  await expect(dash.locator('[data-testid="inbox-row"]')).toHaveCount(2);
});

test("inbox_drag_record_onto_tag_assigns_tag", async () => {
  const dashboardUrl = `chrome-extension://${extensionId}/src/dashboard/index.html`;
  const dash = await context.newPage();
  await dash.goto(dashboardUrl);
  await dash.waitForSelector(".app-shell", { timeout: 5000 });

  await saveClip(dash, "tagged item", ["work"]);
  await saveClip(dash, "untagged item");

  await dash.goto(`${dashboardUrl}#/inbox`);
  await dash.reload();
  await dash.waitForSelector('[data-testid="inbox-row"]', { timeout: 5000 });

  const workTag = dash.locator('[data-testid="inbox-tag"]', {
    hasText: "work",
  });
  await expect(workTag).toBeVisible();

  await dash
    .locator('[data-testid="inbox-row"]', { hasText: "untagged item" })
    .dragTo(workTag);

  const records = await dash.evaluate<
    Array<{ text?: string; tags?: string[] }>
  >(
    async () =>
      new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: "myz:getAllHighlights", payload: undefined },
          (resp) => resolve(resp?.data ?? []),
        );
      }),
  );
  const untagged = records.find((record) =>
    (record.text || "").includes("untagged item"),
  );
  expect(untagged?.tags).toContain("work");
});

async function allHighlights(
  dash: Awaited<ReturnType<BrowserContext["newPage"]>>,
): Promise<Array<{ text?: string; tags?: string[] }>> {
  return dash.evaluate(
    async () =>
      new Promise<Array<{ text?: string; tags?: string[] }>>((resolve) => {
        chrome.runtime.sendMessage(
          { type: "myz:getAllHighlights", payload: undefined },
          (resp) => resolve(resp?.data ?? []),
        );
      }),
  );
}

test("inbox_tag_can_be_dragged_onto_a_record", async () => {
  const dashboardUrl = `chrome-extension://${extensionId}/src/dashboard/index.html`;
  const dash = await context.newPage();
  await dash.goto(dashboardUrl);
  await dash.waitForSelector(".app-shell", { timeout: 5000 });

  await saveClip(dash, "tag source", ["work"]);
  await saveClip(dash, "drop target");
  await dash.goto(`${dashboardUrl}#/inbox`);
  await dash.reload();
  await dash.waitForSelector('[data-testid="inbox-row"]', { timeout: 5000 });

  const workTag = dash.locator('[data-testid="inbox-tag"]', {
    hasText: "work",
  });
  const targetRow = dash.locator('[data-testid="inbox-row"]', {
    hasText: "drop target",
  });
  await workTag.dragTo(targetRow);

  const records = await allHighlights(dash);
  expect(
    records.find((record) => (record.text || "").includes("drop target"))?.tags,
  ).toContain("work");
});

test("inbox_multi_select_drag_tags_all_selected", async () => {
  const dashboardUrl = `chrome-extension://${extensionId}/src/dashboard/index.html`;
  const dash = await context.newPage();
  await dash.goto(dashboardUrl);
  await dash.waitForSelector(".app-shell", { timeout: 5000 });

  await saveClip(dash, "seed tag holder", ["work"]);
  await saveClip(dash, "multi one");
  await saveClip(dash, "multi two");
  await dash.goto(`${dashboardUrl}#/inbox`);
  await dash.reload();
  await dash.waitForSelector('[data-testid="inbox-row"]', { timeout: 5000 });

  for (const text of ["multi one", "multi two"]) {
    await dash
      .locator('[data-testid="inbox-row"]', { hasText: text })
      .getByRole("checkbox")
      .check();
  }

  const workTag = dash.locator('[data-testid="inbox-tag"]', {
    hasText: "work",
  });
  await dash
    .locator('[data-testid="inbox-row"]', { hasText: "multi one" })
    .dragTo(workTag);

  const records = await allHighlights(dash);
  for (const text of ["multi one", "multi two"]) {
    expect(
      records.find((record) => (record.text || "").includes(text))?.tags,
    ).toContain("work");
  }
});

test("inbox_inline_tag_input_adds_tag_via_keyboard", async () => {
  const dashboardUrl = `chrome-extension://${extensionId}/src/dashboard/index.html`;
  const dash = await context.newPage();
  await dash.goto(dashboardUrl);
  await dash.waitForSelector(".app-shell", { timeout: 5000 });

  await saveClip(dash, "keyboard tag me");
  await dash.goto(`${dashboardUrl}#/inbox`);
  await dash.reload();
  await dash.waitForSelector('[data-testid="inbox-row"]', { timeout: 5000 });

  const row = dash.locator('[data-testid="inbox-row"]', {
    hasText: "keyboard tag me",
  });
  await row.getByRole("button", { name: "标签" }).click();
  await row.getByLabel("添加标签").fill("keyboard-tag");
  await row.getByLabel("添加标签").press("Enter");

  const records = await dash.evaluate<
    Array<{ text?: string; tags?: string[] }>
  >(
    async () =>
      new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: "myz:getAllHighlights", payload: undefined },
          (resp) => resolve(resp?.data ?? []),
        );
      }),
  );
  expect(
    records.find((record) => (record.text || "").includes("keyboard tag me"))
      ?.tags,
  ).toContain("keyboard-tag");
});
