import { test, expect, Page } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchExtension } from "../helpers/launch-extension.js";
import { createMockS3Server } from "../helpers/mock-s3-server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionPath = path.join(__dirname, "..", "..", "dist");

async function send<T>(
  page: Page,
  type: string,
  payload?: unknown,
): Promise<T> {
  const response = await page.evaluate(
    async (message: { type: string; payload: unknown }) =>
      new Promise((resolve) => {
        chrome.runtime.sendMessage(message, (result) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(result);
        });
      }),
    { type, payload },
  );
  const typed = response as { ok?: boolean; error?: string; data?: T };
  if (!typed?.ok) {
    throw new Error(`${type} failed: ${typed?.error ?? "no response"}`);
  }
  return typed.data as T;
}

async function saveClip(page: Page, text: string): Promise<void> {
  await send(page, "myz:saveHighlight", {
    url: "https://example.com/article",
    sourceUrl: "https://example.com/article",
    title: `Clip ${text}`,
    text,
    html: `<p>${text}</p>`,
    note: "",
    tags: [],
    hostname: "example.com",
    kind: "clip",
  });
}

const s3Settings = (endpoint: string) => ({
  endpoint,
  region: "us-east-1",
  bucket: "myz",
  accessKeyId: "AKIAMOCK",
  secretAccessKey: "mock-secret",
  sessionToken: "",
  prefix: "",
});

test("syncs highlights and inbox between two profiles via a mock S3", async () => {
  test.setTimeout(120_000);
  const mock = createMockS3Server();
  const { server, url } = await mock.listen(0);
  const deviceA = await launchExtension(extensionPath);
  const deviceB = await launchExtension(extensionPath);

  try {
    expect(deviceA.extensionId).toBeTruthy();
    expect(deviceB.extensionId).toBeTruthy();
    const dashUrl = (id: string) =>
      `chrome-extension://${id}/src/dashboard/index.html`;
    const dashA = await deviceA.context.newPage();
    const dashB = await deviceB.context.newPage();
    await dashA.goto(dashUrl(deviceA.extensionId!));
    await dashA.waitForSelector(".app-shell", { timeout: 10_000 });
    await dashB.goto(dashUrl(deviceB.extensionId!));
    await dashB.waitForSelector(".app-shell", { timeout: 10_000 });

    const s3 = s3Settings(url);
    await send(dashA, "myz:updateSettings", {
      sync: { enabled: true, s3 },
    });
    await send(dashB, "myz:updateSettings", {
      sync: { enabled: true, s3 },
    });

    // A: create a clip, then bootstrap a brand-new v2 account (uploads it).
    await saveClip(dashA, "cross-device clip");
    const bootstrap = await send<{ accountId: string }>(
      dashA,
      "myz:accountBootstrap",
      { rescue: false, userGesture: true },
    );
    expect(bootstrap.accountId).toMatch(/^acct_/);

    // Once a v2 account exists, the legacy key controls are hidden.
    await dashA.goto(`${dashUrl(deviceA.extensionId!)}#/settings/sync`);
    await dashA.reload();
    await expect(dashA.getByText("已使用新格式设备绑定账号同步")).toBeVisible({
      timeout: 10_000,
    });
    await expect(dashA.getByRole("button", { name: "设置密钥" })).toHaveCount(
      0,
    );
    await dashA.goto(dashUrl(deviceA.extensionId!));
    await dashA.waitForSelector(".app-shell", { timeout: 10_000 });

    // Pair B into A's account across the two profiles (offer → response → approve).
    const invite = await send<{ offer: string }>(dashA, "myz:pairingInvite", {
      userGesture: true,
    });
    const accepted = await send<{ response: string; sas: string }>(
      dashB,
      "myz:pairingAccept",
      { invite: invite.offer, userGesture: true },
    );
    const approved = await send<{ sas: string; roster: string }>(
      dashA,
      "myz:pairingApprove",
      { response: accepted.response, userGesture: true },
    );
    expect(approved.sas).toBe(accepted.sas);

    await send(dashB, "myz:accountImport", {
      roster: approved.roster,
      userGesture: true,
    });

    // B syncs and receives A's highlight and its pending Inbox status.
    const sync = await send<{ ok: boolean; status: string }>(
      dashB,
      "myz:syncNow",
    );
    expect(sync.ok).toBe(true);

    const highlights = await send<Array<{ text?: string }>>(
      dashB,
      "myz:getAllHighlights",
    );
    expect(
      highlights.some((record) =>
        (record.text || "").includes("cross-device clip"),
      ),
    ).toBe(true);

    const queue = await send<{ counts: { pending: number } }>(
      dashB,
      "myz:inboxQueue",
    );
    expect(queue.counts.pending).toBeGreaterThanOrEqual(1);
  } finally {
    await deviceA.context.close();
    await deviceB.context.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
