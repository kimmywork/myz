import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { Page, BrowserContext, chromium } from "playwright";


export interface LaunchedExtension {
  context: BrowserContext;
  page: Page;
  userDataDir: string;
  extensionId: string | null;
  openPopupViaServiceWorker: () => Promise<string>;
}

async function launchExtension(extensionPath: string, options = {}) {
  // Prefer loading from the dist/ build output if a directory isn't passed.
  if (!extensionPath) {
    throw new Error("extensionPath is required");
  }

  if (!fs.existsSync(extensionPath)) {
    throw new Error(`Extension path not found: ${extensionPath}`);
  }

  // Create a temporary profile directory so tests are isolated.
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "myz-playwright-"));

  const args = [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
  ];

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args,
    viewport: { width: 1280, height: 800 },
  });

  // Give the extension some time to initialize background/service worker.
  await new Promise((r) => setTimeout(r, 500));

  const pages = context.pages();
  const page = pages.length ? pages[0] : await context.newPage();
  // Try to determine the extension id by inspecting browser targets via CDP.
  let extensionId: string | null = null;
  try {
    // Create a CDP session from the current page and poll for extension targets
    const client = await context.newCDPSession(page);
    const maxAttempts = 8;
    for (let attempt = 0; attempt < maxAttempts && !extensionId; attempt++) {
      const resp = await client.send("Target.getTargets");
      const infos = resp?.targetInfos || [];
      for (const t of infos) {
        if (t && t.url && t.url.startsWith("chrome-extension://")) {
          const m = t.url.match(/^chrome-extension:\/\/([^/]+)\//);
          if (m && m[1]) {
            extensionId = m[1];
            break;
          }
        }
      }
      if (!extensionId) {
        // small backoff for targets to register

        await new Promise((r) => setTimeout(r, 200));
      }
    }
  } catch (e) {
    // ignore — extensionId may remain null
  }

  async function openPopupViaServiceWorker() {
    if (!extensionId) {
      throw new Error("Cannot open popup: unknown extensionId");
    }
    // Attach to the extension service worker target and invoke openPopup.
    const client = await context.newCDPSession(page);
    const resp = await client.send("Target.getTargets");
    const infos = resp?.targetInfos || [];
    const sw = infos.find(
      (t) =>
        t.type === "service_worker" && t.url && t.url.includes(extensionId),
    );
    if (!sw) {
      throw new Error("Service worker target for extension not found");
    }
    const attach = await client.send("Target.attachToTarget", {
      targetId: sw.targetId,
      flatten: true,
    });
    const sessionId = attach?.sessionId;
    if (!sessionId) {
      throw new Error("Failed to attach to service worker session");
    }
    try {
      const resp = await client.send("Runtime.evaluate", {
        expression: `(async function(){
          try {
            if (chrome.action && typeof chrome.action.openPopup === 'function') {
              await chrome.action.openPopup();
              return 'opened';
            }
            const url = 'chrome-extension://' + (chrome.runtime && chrome.runtime.id) + '/src/popup/popup.html';
            if (chrome.tabs && typeof chrome.tabs.create === 'function') {
              await chrome.tabs.create({ url });
              return 'tab_created';
            }
            return 'no_api';
          } catch (e) {
            return 'error:' + String(e);
          }
        })();`,
        awaitPromise: true,
        returnByValue: true,
        // sessionId,
      });
      return resp?.result?.value;
    } finally {
      try {
        await client.send("Target.detachFromTarget", { sessionId });
      } catch (e) {
        // ignore
      }
    }
  }

  return { context, page, userDataDir, extensionId, openPopupViaServiceWorker };
}

export { launchExtension };
