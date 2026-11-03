import { BrowserContext, Page, expect, test } from "@playwright/test";
import { Server } from "node:http";
import path from "node:path";
import {
  openTabProbe as openProbe,
  setAiSettings,
} from "../helpers/ai-chat-harness.js";
import {
  DEEPSEEK_ROUTER_STUB,
  DEEPSEEK_STUB,
  QWEN_CONVERSATION_STUB,
  QWEN_STUB,
} from "../helpers/ai-chat-stubs.js";
import { launchExtension } from "../helpers/launch-extension.js";
import { dirnameFromImportMeta } from "../helpers/runtime.js";
import { createStaticServer } from "../helpers/static-server.js";

/**
 * End-to-end coverage for the toolbar's "使用 DeepSeek 解读" action.
 *
 * `https://chat.deepseek.com` is fulfilled from a local stub so the test never
 * touches the real site: the stub mirrors the parts of DeepSeek's DOM the
 * content script relies on (composer textarea, `aria-pressed` mode toggles,
 * hidden file input, paste handling).
 */

const __dirname = dirnameFromImportMeta(import.meta.url);

let server: Server;
let serverUrl: string;
let context: BrowserContext;
let page: Page;

/** Probe bound to this file's browser context. */
async function openTabProbe(): Promise<Page> {
  return openProbe(context);
}

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

  await context.route("https://chat.deepseek.com/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: path === "/a/chat/s/router" ? DEEPSEEK_ROUTER_STUB : DEEPSEEK_STUB,
    });
  });
  // The hand-off is opt-in (off by default): enable it once for this file so
  // the individual tests can focus on behaviour rather than the switch.
  const probe = await openTabProbe();
  await setAiSettings(probe, { enabled: true, provider: "deepseek" });
  await probe.close();

  await context.route("https://chat.qwen.ai/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: path.startsWith("/c/") ? QWEN_CONVERSATION_STUB : QWEN_STUB,
    });
  });
});

test.afterAll(async () => {
  try {
    await context?.close();
  } catch (e) {}
  try {
    server && server.close();
  } catch (e) {}
});

/** Drag a text selection from `start` to `end` (element handles). */
async function dragSelect(
  target: Page,
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  await target.mouse.move(start.x, start.y);
  await target.mouse.down();
  await target.mouse.move(end.x, end.y);
  await target.mouse.up();
}

/** Drag across the paragraph and the image below it. */
async function selectTextAndImage(target: Page) {
  const para = await target.locator("#ai-para").boundingBox();
  const image = await target.locator("#ai-image").boundingBox();
  if (!para || !image) throw new Error("Fixture is missing boxes");
  await dragSelect(
    target,
    { x: para.x + 8, y: para.y + 8 },
    { x: image.x + image.width - 8, y: image.y + image.height - 8 },
  );
}

/** Text-only selection inside one paragraph. */
async function selectParagraph(target: Page) {
  const para = await target.locator("#para-1").boundingBox();
  if (!para) throw new Error("Fixture is missing the paragraph box");
  await dragSelect(
    target,
    { x: para.x + 8, y: para.y + 8 },
    { x: para.x + para.width - 8, y: para.y + 8 },
  );
}

/** Text-only selection inside the second paragraph. */
async function selectSecondParagraph(target: Page) {
  const para = await target.locator("#para-2").boundingBox();
  if (!para) throw new Error("Fixture is missing the second paragraph box");
  await dragSelect(
    target,
    { x: para.x + 8, y: para.y + 8 },
    { x: para.x + para.width - 8, y: para.y + 8 },
  );
}

interface TabInfo {
  id?: number;
  url?: string;
  active: boolean;
  splitViewId?: number;
}

function isChatTab(tab: TabInfo): boolean {
  return Boolean(tab.url?.startsWith("https://chat.deepseek.com"));
}

async function inspectTabs(
  probe: Page,
): Promise<{ splitViewSupported: boolean; tabs: TabInfo[] }> {
  return probe.evaluate(async () => {
    const api = chrome as unknown as {
      tabs: {
        query: (query: object) => Promise<TabInfo[]>;
        createSplit?: unknown;
      };
    };
    const tabs = await api.tabs.query({});
    return {
      splitViewSupported: typeof api.tabs.createSplit === "function",
      tabs: tabs.map((tab) => ({
        id: tab.id,
        url: tab.url,
        active: tab.active,
        splitViewId: tab.splitViewId,
      })),
    };
  });
}

/** Open the chat stub in its own tab so each test is self-contained. */
async function openChat(url = "https://chat.deepseek.com/"): Promise<Page> {
  const chat = await context.newPage();
  await chat.goto(url);
  return chat;
}

test("ask_deepseek_pastes_selection_into_a_new_chat", async () => {
  test.setTimeout(60_000);

  const probe = await openTabProbe();
  const chat = await openChat();
  const composer = chat.locator("#composer");

  await page.bringToFront();
  await page.goto(`${serverUrl}/ai-selection.html`);
  await selectTextAndImage(page);
  await page.waitForSelector(".myz-annotator-toolbar:not(.myz-hidden)", {
    timeout: 8000,
  });

  await page.locator('button[aria-label="使用 DeepSeek 解读"]').click();

  // Prompt text: template + paragraph + page URL.
  await expect(composer).toHaveValue(/帮我解读这段文字：/, {
    timeout: 30_000,
  });
  await expect(composer).toHaveValue(/selected together with the image/);
  await expect(composer).toHaveValue(
    new RegExp(`网页URL： ${serverUrl}/ai-selection.html`),
  );

  // 深度思考 is switched on before composing.
  await expect(chat.locator("#think")).toHaveAttribute("aria-pressed", "true");
  // The image inside the selection travels as one screenshot of the range.
  const pasted = await chat.evaluate(() => (window as any).__myzAiTest);
  expect(pasted.pastedFiles + pasted.uploadedFiles).toBe(1);

  // The reader's page is not replaced: on browsers with the Split View API
  // (Chrome 155+) the chat opens as a second pane instead of a plain tab.
  const { splitViewSupported, tabs } = await inspectTabs(probe);
  await probe.close();
  const chatTab = tabs.find((tab) => isChatTab(tab));
  const sourceTab = tabs.find((tab) => tab.url?.includes("/ai-selection.html"));
  expect(chatTab).toBeTruthy();
  expect(sourceTab).toBeTruthy();
  if (splitViewSupported) {
    expect(chatTab?.splitViewId).toBe(sourceTab?.splitViewId);
    expect(chatTab?.splitViewId).not.toBe(-1);
  } else {
    // Older browsers fall back to focusing the chat tab.
    expect(chatTab?.active).toBe(true);
    expect(sourceTab?.active).toBe(false);
  }

  await probe.close();
  await chat.close();
});

test("text_only_selection_sends_no_screenshot", async () => {
  test.setTimeout(60_000);

  const chat = await openChat();

  await page.bringToFront();
  await page.goto(`${serverUrl}/myz-test.html`);
  await selectParagraph(page);
  await page.waitForSelector(".myz-annotator-toolbar:not(.myz-hidden)", {
    timeout: 8000,
  });
  await page.locator('button[aria-label="使用 DeepSeek 解读"]').click();

  await expect(chat.locator("#composer")).toHaveValue(
    /simple paragraph used for automated testing/,
    { timeout: 30_000 },
  );
  // A screenshot would only duplicate the words, so nothing is attached.
  const pasted = await chat.evaluate(() => (window as any).__myzAiTest);
  expect(pasted.pastedFiles + pasted.uploadedFiles).toBe(0);

  await chat.close();
});

test("settings_control_the_button_and_the_prompt_template", async () => {
  test.setTimeout(60_000);
  const probe = await openTabProbe();
  const chat = await openChat();

  // Disabled: the toolbar keeps its other actions but drops the AI button.
  await setAiSettings(probe, { enabled: false });
  await page.bringToFront();
  await page.goto(`${serverUrl}/myz-test.html`);
  await selectParagraph(page);
  await page.waitForSelector(".myz-annotator-toolbar:not(.myz-hidden)", {
    timeout: 8000,
  });
  const labels = await page.$$eval(".myz-annotator-toolbar button", (buttons) =>
    buttons.map((button) => button.getAttribute("aria-label")),
  );
  expect(labels).toEqual(["划线", "摘录", "截取", "翻译", "搜索"]);

  // Enabled with a custom template: the prompt is rendered by the background
  // from stored settings, not hard-coded in the content script.
  await setAiSettings(probe, {
    enabled: true,
    promptTemplate: "解释这段：{TEXT}\n\n（来源 {URL}）",
  });
  await page.reload();
  await selectParagraph(page);
  await page.waitForSelector(".myz-annotator-toolbar:not(.myz-hidden)", {
    timeout: 8000,
  });
  await page.locator('button[aria-label="使用 DeepSeek 解读"]').click();

  const expected = new RegExp(
    `^解释这段：[\\s\\S]*simple paragraph used for automated testing[\\s\\S]*（来源 ${serverUrl}/myz-test.html）$`,
  );
  await expect(chat.locator("#composer")).toHaveValue(expected, {
    timeout: 30_000,
  });

  // Restore defaults so later runs are unaffected.
  await setAiSettings(probe, {
    enabled: true,
    promptTemplate: "帮我解读这段文字：\n\n{TEXT}\n\n网页URL： {URL}",
  });
  await probe.close();
  await chat.close();
});

test("follow_up_on_the_same_page_reuses_the_conversation", async () => {
  test.setTimeout(90_000);
  const chat = await openChat();

  // Count chat-tab navigations: a follow-up must not reload the conversation.
  let chatLoads = 0;
  chat.on("load", () => {
    chatLoads += 1;
  });

  await page.bringToFront();
  await page.goto(`${serverUrl}/myz-test.html`);
  await selectParagraph(page);
  await page.waitForSelector(".myz-annotator-toolbar:not(.myz-hidden)", {
    timeout: 8000,
  });
  await page.locator('button[aria-label="使用 DeepSeek 解读"]').click();
  await expect(chat.locator("#composer")).toHaveValue(
    /simple paragraph used for automated testing/,
    { timeout: 30_000 },
  );
  expect(chatLoads).toBe(0);

  // The site turns `/` into `/a/chat/s/<id>` once the user sends our message.
  await chat.goto("https://chat.deepseek.com/a/chat/s/abc");
  chatLoads = 0;

  // Second click on the same page continues that conversation in place: no
  // navigation, and the draft is replaced by the new excerpt.
  await page.bringToFront();
  await page.locator("#para-2").click();
  await selectSecondParagraph(page);
  await page.waitForSelector(".myz-annotator-toolbar:not(.myz-hidden)", {
    timeout: 8000,
  });
  await page.locator('button[aria-label="使用 DeepSeek 解读"]').click();
  await expect(chat.locator("#composer")).toHaveValue(
    /paragraph to ensure selection across multiple nodes/,
    { timeout: 30_000 },
  );
  await expect(chat.locator("#composer")).not.toHaveValue(
    /simple paragraph used for automated testing/,
  );
  expect(chat.url()).toContain("/a/chat/s/abc");
  expect(chatLoads).toBe(0);

  // A different page starts over: the old conversation is left and a new chat
  // is opened.
  await page.bringToFront();
  await page.goto(`${serverUrl}/myz-test.html?ref=other`);
  await selectParagraph(page);
  await page.waitForSelector(".myz-annotator-toolbar:not(.myz-hidden)", {
    timeout: 8000,
  });
  await page.locator('button[aria-label="使用 DeepSeek 解读"]').click();
  await expect(chat.locator("#composer")).toHaveValue(
    /simple paragraph used for automated testing/,
    { timeout: 30_000 },
  );
  await expect.poll(() => chat.url()).toMatch(/myz|deepseek/);
  expect(chat.url()).toBe("https://chat.deepseek.com/");
  expect(chatLoads).toBeGreaterThanOrEqual(1);

  await chat.close();
});

test("qwen_provider_fills_its_own_chat_tab", async () => {
  test.setTimeout(60_000);
  const probe = await openTabProbe();

  // The Qwen tab is pre-opened so the background reuses it instead of creating
  // one (that path is covered by the DeepSeek test).
  const qwen = await openChat("https://chat.qwen.ai/");
  const qwenComposer = qwen.locator("#composer");
  const deepseek = await openChat();

  await setAiSettings(probe, { enabled: true, provider: "qwen" });

  await page.bringToFront();
  await page.goto(`${serverUrl}/myz-test.html`);
  await selectParagraph(page);
  await page.waitForSelector(".myz-annotator-toolbar:not(.myz-hidden)", {
    timeout: 8000,
  });
  // The toolbar label follows the provider from public settings.
  const label = await page
    .locator(".myz-annotator-toolbar button")
    .evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("aria-label")),
    );
  expect(label).toContain("使用 Qwen 解读");

  const deepseekBefore = await deepseek.locator("#composer").inputValue();

  await page.locator('button[aria-label="使用 Qwen 解读"]').click();
  await expect(qwenComposer).toHaveValue(
    /simple paragraph used for automated testing/,
    { timeout: 30_000 },
  );
  await expect(qwenComposer).toHaveValue(
    new RegExp(`网页URL： ${serverUrl}/myz-test.html`),
  );
  expect(qwen.url()).toBe("https://chat.qwen.ai/");

  // The DeepSeek side is untouched by the provider switch.
  expect(await deepseek.locator("#composer").inputValue()).toBe(deepseekBefore);

  await setAiSettings(probe, { provider: "deepseek" });
  await qwen.close();
  await deepseek.close();
  await probe.close();
});

test("switching_conversation_never_fills_the_old_composer", async () => {
  test.setTimeout(60_000);
  const chat = await openChat("https://chat.deepseek.com/a/chat/s/old");
  // The DeepSeek stub has no in-page new-chat control, so the background has to
  // navigate. The input counter survives the reload via localStorage, which
  // lets the test prove the outgoing composer was never written to.
  await chat.evaluate(() => localStorage.setItem("myzWrites", "0"));

  await page.bringToFront();
  await page.goto(`${serverUrl}/myz-test.html`);
  await selectParagraph(page);
  await page.waitForSelector(".myz-annotator-toolbar:not(.myz-hidden)", {
    timeout: 8000,
  });
  await page.locator('button[aria-label="使用 DeepSeek 解读"]').click();

  await expect(chat.locator("#composer")).toHaveValue(
    /simple paragraph used for automated testing/,
    { timeout: 30_000 },
  );
  expect(chat.url()).toBe("https://chat.deepseek.com/");
  expect(await chat.evaluate(() => localStorage.getItem("myzWrites"))).toBe(
    "1",
  );

  await chat.close();
});

test("qwen_starts_a_new_chat_in_page_without_reloading", async () => {
  test.setTimeout(60_000);
  const probe = await openTabProbe();
  await setAiSettings(probe, { enabled: true, provider: "qwen" });

  const qwen = await openChat("https://chat.qwen.ai/c/old");
  let loads = 0;
  qwen.on("load", () => {
    loads += 1;
  });
  await qwen.evaluate(() => localStorage.setItem("myzWrites", "0"));

  await page.bringToFront();
  await page.goto(`${serverUrl}/myz-test.html`);
  await selectParagraph(page);
  await page.waitForSelector(".myz-annotator-toolbar:not(.myz-hidden)", {
    timeout: 8000,
  });
  await page.locator('button[aria-label="使用 Qwen 解读"]').click();

  await expect(qwen.locator("#composer")).toHaveValue(
    /simple paragraph used for automated testing/,
    { timeout: 30_000 },
  );
  // The conversation was left through the in-page control: URL changed, the
  // document did not reload, and only the fresh composer was written to.
  expect(loads).toBe(0);
  expect(qwen.url()).toBe("https://chat.qwen.ai/c/new-chat");
  expect(await qwen.evaluate(() => localStorage.getItem("myzWrites"))).toBe(
    "1",
  );

  await setAiSettings(probe, { provider: "deepseek" });
  await qwen.close();
  await probe.close();
});

test("deepseek_switches_conversation_in_page_when_the_router_answers", async () => {
  test.setTimeout(60_000);
  const chat = await openChat("https://chat.deepseek.com/a/chat/s/router");
  let loads = 0;
  chat.on("load", () => {
    loads += 1;
  });
  await chat.evaluate(() => localStorage.setItem("myzWrites", "0"));

  await page.bringToFront();
  await page.goto(`${serverUrl}/myz-test.html`);
  await selectParagraph(page);
  await page.waitForSelector(".myz-annotator-toolbar:not(.myz-hidden)", {
    timeout: 8000,
  });
  await page.locator('button[aria-label="使用 DeepSeek 解读"]').click();

  await expect(chat.locator("#composer")).toHaveValue(
    /simple paragraph used for automated testing/,
    { timeout: 30_000 },
  );
  // No button selector is configured for this provider, but the router-driven
  // switch was verified by the view changing: no reload, one write.
  expect(loads).toBe(0);
  expect(chat.url()).toBe("https://chat.deepseek.com/");
  expect(await chat.evaluate(() => localStorage.getItem("myzWrites"))).toBe(
    "1",
  );

  await chat.close();
});
