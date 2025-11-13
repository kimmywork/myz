const path = require("path");
const { test, expect } = require("@playwright/test");
const { createStaticServer } = require("../helpers/static-server");
const { launchExtension } = require("../helpers/launch-extension");

let server;
let serverUrl;
let context;
let page;
let extensionId;
let launched;

test.beforeAll(async () => {
  const fixtures = path.join(__dirname, "..", "fixtures");
  const s = createStaticServer(fixtures);
  const listen = await s.listen(0);
  server = listen.server;
  serverUrl = listen.url;

  // Build output must exist at dist/
  const extensionPath = path.join(__dirname, "..", "..", "dist");
  launched = await launchExtension(extensionPath);
  context = launched.context;
  page = launched.page;
  extensionId = launched.extensionId;
  if (!extensionId) throw new Error("extensionId null");
});

test.afterAll(async () => {
  await context.close();
  await new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

test("context menu toggles zen mode and print styles", async () => {
  await page.goto(`${serverUrl}/article-page.html`);
  // Wait for content script init
  await page.waitForTimeout(300);

  // Simulate invoking the context menu handler by sending the same runtime message
  // since Playwright cannot click Chrome's context menu.
  // Trigger via e2e message bridge (works even if chrome.runtime is unavailable)
  await page.evaluate(() => {
    window.postMessage({ __myz_e2e__: true, type: "toggleZenMode" }, "*");
  });

  // Article should remain visible, others hidden
  const articleVisible = await page.isVisible("article#art");
  const headerVisible = await page.isVisible("#hdr").catch(() => false);
  const navVisible = await page.isVisible("#nav").catch(() => false);
  const asideVisible = await page.isVisible("#aside").catch(() => false);
  const footerVisible = await page.isVisible("#ftr").catch(() => false);

  expect(articleVisible).toBeTruthy();
  expect(headerVisible).toBeFalsy();
  expect(navVisible).toBeFalsy();
  expect(asideVisible).toBeFalsy();
  expect(footerVisible).toBeFalsy();

  // Verify print media rule exists when zen is enabled
  const printRuleFound = await page.evaluate(() => {
    const style = document.getElementById("myz-zen-style");
    return Boolean(style && /@media print/.test(style.textContent || ""));
  });
  expect(printRuleFound).toBeTruthy();

  // Toggle off
  await page.evaluate(() => {
    window.postMessage({ __myz_e2e__: true, type: "toggleZenMode" }, "*");
  });
  // After off, header likely visible again
  const headerVisibleAfter = await page.isVisible("#hdr");
  expect(headerVisibleAfter).toBeTruthy();
});

test("zen mode works with id=article and url mapping", async () => {
  // id=article
  await page.goto(`${serverUrl}/id-article.html`);
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    window.postMessage({ __myz_e2e__: true, type: "toggleZenMode" }, "*");
  });
  expect(await page.isVisible("#article")).toBeTruthy();
  expect(await page.isVisible("#hdr").catch(() => false)).toBeFalsy();
  // toggle off
  await page.evaluate(() => {
    window.postMessage({ __myz_e2e__: true, type: "toggleZenMode" }, "*");
  });

  // url-mapped selector
  await page.goto(`${serverUrl}/article-mapped.html`);
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    window.postMessage({ __myz_e2e__: true, type: "toggleZenMode" }, "*");
  });
  expect(await page.isVisible("#special-article")).toBeTruthy();
  expect(await page.isVisible("#hdr").catch(() => false)).toBeFalsy();
});
