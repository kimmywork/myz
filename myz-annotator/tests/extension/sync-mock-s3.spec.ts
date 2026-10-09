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

async function saveClip(page: Page, text: string): Promise<{ id: string }> {
  return send<{ id: string }>(page, "myz:saveHighlight", {
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
    const clip = await saveClip(dashA, "cross-device clip");
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

    // A deletes the highlight; the tombstone must propagate and B must remove
    // both the highlight and its Inbox status.
    await send(dashA, "myz:removeHighlight", { id: clip.id });
    await send(dashA, "myz:syncNow");
    await send(dashB, "myz:syncNow");

    const afterDelete = await send<Array<{ text?: string }>>(
      dashB,
      "myz:getAllHighlights",
    );
    expect(
      afterDelete.some((record) =>
        (record.text || "").includes("cross-device clip"),
      ),
    ).toBe(false);
    const queueAfter = await send<{ counts: { pending: number } }>(
      dashB,
      "myz:inboxQueue",
    );
    expect(queueAfter.counts.pending).toBe(0);
  } finally {
    await deviceA.context.close();
    await deviceB.context.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("first-run wizard: branch B creates an account and syncs", async () => {
  test.setTimeout(120_000);
  const mock = createMockS3Server();
  const { server, url } = await mock.listen(0);
  const device = await launchExtension(extensionPath);

  try {
    const dashUrl = `chrome-extension://${device.extensionId}/src/dashboard/index.html`;
    const page = await device.context.newPage();
    await page.goto(`${dashUrl}#/settings/sync`);
    await page.waitForSelector(".app-shell", { timeout: 10_000 });

    // No account and not seen yet → auto-enter the wizard.
    await page.waitForURL(/#\/setup/, { timeout: 10_000 });
    await expect(page.getByRole("button", { name: "新建账号" })).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "加入已有账号" }),
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "给新设备授权" }),
    ).toBeDisabled();

    await page.getByRole("button", { name: "新建账号" }).click();

    // B1: S3 with a test-connection gate.
    await page.getByLabel("Endpoint").fill(url);
    await page.getByLabel("Region").fill("us-east-1");
    await page.getByLabel("Bucket").fill("myz");
    await page.getByLabel("Access Key ID").fill("AKIAMOCK");
    await page.getByLabel("Secret Key").fill("mock-secret");
    await page.getByRole("button", { name: "测试连接" }).click();
    await expect(page.getByText("连接成功")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "下一步" }).click();

    // B2: migration is always shown, here with no legacy data.
    await expect(page.getByText("未检测到旧格式数据，无需迁移")).toBeVisible();
    await page.getByRole("button", { name: "下一步" }).click();

    // B3: create the account.
    await page.getByRole("button", { name: "创建同步账号" }).click();
    await expect(page.getByLabel("Account ID")).toHaveValue(/acct_/, {
      timeout: 10_000,
    });
    const accountId = await page.getByLabel("Account ID").inputValue();
    await page.getByRole("button", { name: "下一步" }).click();

    // A local record that must be uploaded by the first sync.
    await saveClip(page, "wizard-uploaded-clip");

    // B4: first sync.
    await page.getByRole("button", { name: "开始同步" }).click();
    await expect(page.getByText("首次同步完成", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "下一步" }).click();

    // The first sync really wrote ciphertext under the account to S3.
    const status = await send<{ lastSyncAt: string | null }>(
      page,
      "myz:syncStatus",
    );
    expect(status.lastSyncAt).toBeTruthy();
    expect(
      Array.from(mock.objects.keys()).some((key) =>
        key.startsWith(`${accountId}/`),
      ),
    ).toBe(true);

    // B5: done.
    await expect(page.getByText("账号已建立并完成首次同步")).toBeVisible();
    await page.getByRole("button", { name: "完成" }).click();
    await page.waitForURL(/#\/settings\/sync/);
    await expect(page.getByText("已建立")).toBeVisible();

    // The wizard must not auto-open again on the next visit.
    await page.reload();
    await page.waitForURL(/#\/settings\/sync/, { timeout: 10_000 });
    await expect(page.getByText("已建立")).toBeVisible();
  } finally {
    await device.context.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("first-run wizard: authorize branch gates completion on the SAS", async () => {
  test.setTimeout(120_000);
  const mock = createMockS3Server();
  const { server, url } = await mock.listen(0);
  const host = await launchExtension(extensionPath);
  const guest = await launchExtension(extensionPath);

  try {
    const dashUrl = (id: string) =>
      `chrome-extension://${id}/src/dashboard/index.html`;
    const hostPage = await host.context.newPage();
    await hostPage.goto(dashUrl(host.extensionId!));
    await hostPage.waitForSelector(".app-shell", { timeout: 10_000 });
    await send(hostPage, "myz:updateSettings", {
      sync: { enabled: true, s3: s3Settings(url) },
    });
    const bootstrap = await send<{ accountId: string }>(
      hostPage,
      "myz:accountBootstrap",
      { rescue: false, userGesture: true },
    );
    expect(bootstrap.accountId).toMatch(/^acct_/);

    // Open the wizard directly on branch C.
    await hostPage.goto(
      `${dashUrl(host.extensionId!)}#/setup?scenario=authorize`,
    );
    await hostPage.waitForSelector(".app-shell", { timeout: 10_000 });

    // C1: generate the invite (S3 already configured → no S3 step).
    await hostPage.getByRole("button", { name: "生成配对邀请" }).click();
    const inviteField = hostPage.getByLabel("邀请串");
    await expect(inviteField).toHaveValue(/.+/, { timeout: 10_000 });
    const invite = await inviteField.inputValue();
    await hostPage.getByRole("button", { name: "下一步" }).click();

    // Guest accepts the invite and returns a response + SAS.
    const guestPage = await guest.context.newPage();
    await guestPage.goto(dashUrl(guest.extensionId!));
    await guestPage.waitForSelector(".app-shell", { timeout: 10_000 });
    const accepted = await send<{ response: string; sas: string }>(
      guestPage,
      "myz:pairingAccept",
      { invite, userGesture: true },
    );

    // C2/C3: paste the response, then approve.
    await hostPage.getByLabel("响应串").fill(accepted.response);
    await hostPage.getByRole("button", { name: "下一步" }).click();
    await hostPage.getByRole("button", { name: "批准并加入设备" }).click();
    await expect(hostPage.getByText(accepted.sas, { exact: true })).toBeVisible(
      {
        timeout: 10_000,
      },
    );

    // Completion is blocked until the host confirms the SAS.
    const done = hostPage.getByRole("button", { name: "完成" });
    await expect(done).toBeDisabled();
    await hostPage.getByRole("checkbox").check();
    await expect(done).toBeEnabled();
  } finally {
    await host.context.close();
    await guest.context.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("first-run wizard: branch A joins and uses the prefilled S3 prefix", async () => {
  test.setTimeout(120_000);
  const mock = createMockS3Server();
  const { server, url } = await mock.listen(0);
  const host = await launchExtension(extensionPath);
  const guest = await launchExtension(extensionPath);

  try {
    const dashUrl = (id: string) =>
      `chrome-extension://${id}/src/dashboard/index.html`;

    // Host: S3 with a non-empty prefix, seed a clip, create the account.
    const hostPage = await host.context.newPage();
    await hostPage.goto(dashUrl(host.extensionId!));
    await hostPage.waitForSelector(".app-shell", { timeout: 10_000 });
    await send(hostPage, "myz:updateSettings", {
      sync: { enabled: true, s3: { ...s3Settings(url), prefix: "team-a" } },
    });
    await saveClip(hostPage, "host-seeded-clip");
    await send(hostPage, "myz:accountBootstrap", {
      rescue: false,
      userGesture: true,
    });
    const invite = await send<{ offer: string }>(
      hostPage,
      "myz:pairingInvite",
      {
        userGesture: true,
      },
    );

    // Guest: enter the join wizard and leave the prefix empty on purpose.
    const guestPage = await guest.context.newPage();
    await guestPage.goto(`${dashUrl(guest.extensionId!)}#/setup?scenario=join`);
    await guestPage.waitForSelector(".app-shell", { timeout: 10_000 });
    await guestPage.getByLabel("Endpoint").fill(url);
    await guestPage.getByLabel("Region").fill("us-east-1");
    await guestPage.getByLabel("Bucket").fill("myz");
    await guestPage.getByLabel("Access Key ID").fill("AKIAMOCK");
    await guestPage.getByLabel("Secret Key").fill("mock-secret");
    await guestPage.getByRole("button", { name: "测试连接" }).click();
    await expect(guestPage.getByText("连接成功")).toBeVisible({
      timeout: 10_000,
    });
    await guestPage.getByRole("button", { name: "下一步" }).click();

    // A2: accepting the invite prefills and persists the host's S3 prefix.
    await guestPage.getByLabel("邀请串").fill(invite.offer);
    await guestPage.getByRole("button", { name: "解析邀请" }).click();
    await expect(guestPage.getByText("本机短码：")).toBeVisible({
      timeout: 10_000,
    });
    const response = await guestPage.getByLabel("响应串").inputValue();
    await guestPage.getByRole("button", { name: "下一步" }).click();

    // Host approves the response.
    const approved = await send<{ sas: string; roster: string }>(
      hostPage,
      "myz:pairingApprove",
      { response, userGesture: true },
    );

    // A4: paste the pairing string and confirm the SAS.
    await guestPage.getByLabel("配对串").fill(approved.roster);
    await guestPage.getByRole("checkbox").check();
    await guestPage.getByRole("button", { name: "完成加入" }).click();

    // A5: first sync.
    await guestPage.getByRole("button", { name: "开始同步" }).click();
    await expect(
      guestPage.getByText("首次同步完成", { exact: true }),
    ).toBeVisible({ timeout: 20_000 });

    // The prefilled prefix was persisted and used, so the guest reads the
    // host's record from the same S3 prefix.
    const settings = await send<{ sync: { s3: { prefix?: string } } }>(
      guestPage,
      "myz:getSettings",
    );
    expect(settings.sync.s3.prefix).toBe("team-a");
    const highlights = await send<Array<{ text?: string }>>(
      guestPage,
      "myz:getAllHighlights",
    );
    expect(
      highlights.some((record) =>
        (record.text || "").includes("host-seeded-clip"),
      ),
    ).toBe(true);
  } finally {
    await host.context.close();
    await guest.context.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
