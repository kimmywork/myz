import { SettingsRow } from "@myz/dashboard-ui";
import { sendMessage } from "@myz/shared/messaging";
import { defineComponent, onMounted, ref, watchEffect } from "vue";
import { useSettingsStore } from "../../stores/settings.js";
import ToggleSwitch from "../ToggleSwitch.jsx";
import type {
  SyncNowMessageResult,
  SyncStatusMessageResult,
  SyncTestConnectionMessageResult,
} from "@/background/messages/sync";

type StatusTone = "info" | "error" | "success";

export default defineComponent({
  name: "SyncSection",

  setup() {
    const settingsStore = useSettingsStore();

    const enabled = ref(false);
    const endpoint = ref("");
    const region = ref("");
    const bucket = ref("");
    const accessKeyId = ref("");
    const secretAccessKey = ref("");
    const sessionToken = ref("");
    const prefix = ref("");
    const syncSecret = ref("");

    const status = ref("");
    const tone = ref<StatusTone>("info");
    const isBusy = ref(false);

    const keyId = ref<string | null>(null);
    const keyUpdatedAt = ref<string | null>(null);
    const lastSyncAt = ref<string | null>(null);
    const lastManifestVersion = ref(0);
    const hasAccount = ref(false);
    const accountId = ref<string | null>(null);
    const deviceId = ref<string | null>(null);
    const accountEpoch = ref(0);
    const accountRoster = ref("");
    const pairingInvite = ref("");
    const pairingInviteInput = ref("");
    const pairingResponseInput = ref("");
    const pairingGuestResponse = ref("");
    const pairingGuestSas = ref("");
    const pairingHostSas = ref("");
    const pairingRoster = ref("");

    watchEffect(() => {
      const sync = settingsStore.settings.sync;
      enabled.value = Boolean(sync?.enabled);
      endpoint.value = sync?.s3?.endpoint || "";
      region.value = sync?.s3?.region || "";
      bucket.value = sync?.s3?.bucket || "";
      accessKeyId.value = sync?.s3?.accessKeyId || "";
      secretAccessKey.value = sync?.s3?.secretAccessKey || "";
      sessionToken.value = sync?.s3?.sessionToken || "";
      prefix.value = sync?.s3?.prefix || "";
    });

    function setStatus(message: string, nextTone: StatusTone = "info") {
      status.value = message;
      tone.value = nextTone;
    }

    function buildS3Payload() {
      return {
        endpoint: endpoint.value.trim(),
        region: region.value.trim(),
        bucket: bucket.value.trim(),
        accessKeyId: accessKeyId.value.trim(),
        secretAccessKey: secretAccessKey.value.trim(),
        sessionToken: sessionToken.value.trim(),
        prefix: prefix.value.trim(),
      };
    }

    async function refreshSyncStatus() {
      try {
        const result = await sendMessage<undefined, SyncStatusMessageResult>(
          "myz:syncStatus",
        );
        keyId.value = result?.keyId || null;
        keyUpdatedAt.value = result?.keyUpdatedAt || null;
        lastSyncAt.value = result?.lastSyncAt || null;
        lastManifestVersion.value = result?.lastManifestVersion || 0;
        hasAccount.value = Boolean(result?.hasAccount);
        accountId.value = result?.accountId || null;
        deviceId.value = result?.deviceId || null;
        accountEpoch.value = result?.epoch || 0;
      } catch (error) {
        setStatus(`读取同步状态失败：${(error as Error).message}`, "error");
      }
    }

    async function handleSaveSettings() {
      if (isBusy.value) return;
      isBusy.value = true;
      setStatus("保存中…", "info");
      try {
        await settingsStore.saveSettings({
          sync: {
            enabled: enabled.value,
            s3: buildS3Payload(),
          },
        });
        setStatus("设置已保存", "success");
      } catch (error) {
        setStatus(`保存失败：${(error as Error).message}`, "error");
      } finally {
        isBusy.value = false;
      }
    }

    async function handleTestConnection() {
      if (isBusy.value) return;
      isBusy.value = true;
      setStatus("测试连接中…", "info");
      try {
        const result = await sendMessage<
          { s3: ReturnType<typeof buildS3Payload> },
          SyncTestConnectionMessageResult
        >("myz:syncTestConnection", { s3: buildS3Payload() });
        if (result?.ok) {
          setStatus("连接成功", "success");
        } else {
          setStatus(result?.message || "连接失败", "error");
        }
      } catch (error) {
        setStatus(`连接失败：${(error as Error).message}`, "error");
      } finally {
        isBusy.value = false;
      }
    }

    async function handleSetKey() {
      if (isBusy.value) return;
      if (!syncSecret.value.trim()) {
        setStatus("请输入同步密钥", "error");
        return;
      }
      isBusy.value = true;
      setStatus("设置密钥中…", "info");
      try {
        const confirmed = window.confirm(
          "更改同步密钥会触发密钥轮换，旧密钥数据将无法继续解密。确定继续？",
        );
        if (!confirmed) {
          setStatus("已取消", "info");
          return;
        }
        await sendMessage("myz:syncSetKey", {
          secret: syncSecret.value.trim(),
          userGesture: true,
        });
        syncSecret.value = "";
        await refreshSyncStatus();
        setStatus("密钥已更新", "success");
      } catch (error) {
        setStatus(`设置密钥失败：${(error as Error).message}`, "error");
      } finally {
        isBusy.value = false;
      }
    }

    async function handleSyncNow() {
      if (isBusy.value) return;
      isBusy.value = true;
      setStatus("同步中…", "info");
      try {
        const result = await sendMessage<undefined, SyncNowMessageResult>(
          "myz:syncNow",
        );
        if (result?.ok) {
          setStatus("同步完成", "success");
        } else {
          setStatus(result?.message || "同步失败", "error");
        }
        await refreshSyncStatus();
      } catch (error) {
        setStatus(`同步失败：${(error as Error).message}`, "error");
      } finally {
        isBusy.value = false;
      }
    }

    async function handleCreateAccount() {
      if (isBusy.value) return;
      if (
        !window.confirm(
          "创建新的同步账号会使用本机数据建立新的加密账号。确定继续？",
        )
      ) {
        return;
      }
      isBusy.value = true;
      setStatus("创建账号中…", "info");
      try {
        const result = await sendMessage<
          { userGesture: boolean },
          { accountId: string; deviceId: string; epoch: number; roster: string }
        >("myz:accountCreate", { userGesture: true });
        accountRoster.value = result.roster;
        await refreshSyncStatus();
        setStatus("账号已创建，请复制配对串到其他设备", "success");
      } catch (error) {
        setStatus(`创建账号失败：${(error as Error).message}`, "error");
      } finally {
        isBusy.value = false;
      }
    }

    async function handleImportAccount() {
      if (isBusy.value) return;
      const roster = window.prompt("粘贴其他设备提供的账号配对串");
      if (!roster?.trim()) return;
      isBusy.value = true;
      setStatus("导入账号中…", "info");
      try {
        await sendMessage("myz:accountImport", {
          roster: roster.trim(),
          userGesture: true,
        });
        await refreshSyncStatus();
        setStatus("账号已导入", "success");
      } catch (error) {
        setStatus(`导入失败：${(error as Error).message}`, "error");
      } finally {
        isBusy.value = false;
      }
    }

    async function handlePairingInvite() {
      if (isBusy.value) return;
      isBusy.value = true;
      setStatus("生成邀请中…", "info");
      try {
        const result = await sendMessage<
          { userGesture: boolean },
          { offer: string }
        >("myz:pairingInvite", { userGesture: true });
        pairingInvite.value = result.offer;
        setStatus("邀请已生成，请发送给新设备", "success");
      } catch (error) {
        setStatus(`生成失败：${(error as Error).message}`, "error");
      } finally {
        isBusy.value = false;
      }
    }

    async function handleAcceptPairing() {
      if (isBusy.value) return;
      if (!pairingInviteInput.value.trim()) {
        setStatus("请粘贴邀请串", "error");
        return;
      }
      isBusy.value = true;
      setStatus("生成响应中…", "info");
      try {
        const result = await sendMessage<
          { invite: string; userGesture: boolean },
          { response: string; sas: string }
        >("myz:pairingAccept", {
          invite: pairingInviteInput.value.trim(),
          userGesture: true,
        });
        pairingGuestResponse.value = result.response;
        pairingGuestSas.value = result.sas;
        setStatus("已生成响应，请把响应发回主机并核对短码", "success");
      } catch (error) {
        setStatus(`接受失败：${(error as Error).message}`, "error");
      } finally {
        isBusy.value = false;
      }
    }

    async function handleApprovePairing() {
      if (isBusy.value) return;
      if (!pairingResponseInput.value.trim()) {
        setStatus("请粘贴响应串", "error");
        return;
      }
      isBusy.value = true;
      setStatus("批准中…", "info");
      try {
        const result = await sendMessage<
          { response: string; userGesture: boolean },
          { sas: string; roster: string }
        >("myz:pairingApprove", {
          response: pairingResponseInput.value.trim(),
          userGesture: true,
        });
        pairingHostSas.value = result.sas;
        pairingRoster.value = result.roster;
        await refreshSyncStatus();
        setStatus("设备已加入，请核对短码并把配对串发回新设备", "success");
      } catch (error) {
        setStatus(`批准失败：${(error as Error).message}`, "error");
      } finally {
        isBusy.value = false;
      }
    }

    async function handleBootstrap() {
      if (isBusy.value) return;
      if (
        !window.confirm(
          "将旧格式的云端数据一次性迁移到新的设备绑定账号，并清理旧密钥。确定继续？",
        )
      ) {
        return;
      }
      isBusy.value = true;
      setStatus("迁移中…", "info");
      try {
        const result = await sendMessage<
          { rescue: boolean; userGesture: boolean },
          { accountId: string; rescued: number }
        >("myz:accountBootstrap", { rescue: true, userGesture: true });
        await refreshSyncStatus();
        setStatus(`账号已创建，迁移 ${result.rescued} 条旧记录`, "success");
      } catch (error) {
        setStatus(`迁移失败：${(error as Error).message}`, "error");
      } finally {
        isBusy.value = false;
      }
    }

    async function handleClearAccount() {
      if (isBusy.value) return;
      if (
        !window.confirm(
          "解除本机的同步账号？本机数据保留，但需要重新配对才能再同步。",
        )
      ) {
        return;
      }
      isBusy.value = true;
      try {
        await sendMessage("myz:accountClear", { userGesture: true });
        accountRoster.value = "";
        await refreshSyncStatus();
        setStatus("已解除同步账号", "success");
      } catch (error) {
        setStatus(`操作失败：${(error as Error).message}`, "error");
      } finally {
        isBusy.value = false;
      }
    }

    onMounted(() => {
      void refreshSyncStatus();
    });

    return () => (
      <section class="settings__group">
        <div class="settings__group-header">
          <h3>加密同步</h3>
        </div>
        <div class="settings__fields">
          <p class="settings__hint">
            仅密文存储到 S3。请先保存 S3
            配置；新格式账号使用设备绑定，无需旧格式同步密钥。
          </p>

          <SettingsRow
            label="启用同步"
            hint="开启后按下面的配置加密上传"
            controlWidth="auto"
            class="rounded-control border border-line bg-surface p-3 dark:border-line dark:bg-surface-2"
          >
            <ToggleSwitch
              checked={enabled.value}
              ariaLabel="启用同步"
              onChange={(event: Event) =>
                (enabled.value = (event.target as HTMLInputElement).checked)
              }
            />
          </SettingsRow>

          <div class="grid gap-4 rounded-control border border-line bg-surface p-4 dark:border-line dark:bg-surface-2">
            <SettingsRow label="S3 Endpoint">
              <input
                type="url"
                placeholder="https://s3.example.com"
                value={endpoint.value}
                onInput={(event: InputEvent) =>
                  (endpoint.value = (event.target as HTMLInputElement).value)
                }
              />
            </SettingsRow>
            <SettingsRow label="Region">
              <input
                type="text"
                placeholder="us-east-1"
                value={region.value}
                onInput={(event: InputEvent) =>
                  (region.value = (event.target as HTMLInputElement).value)
                }
              />
            </SettingsRow>
            <SettingsRow label="Bucket">
              <input
                type="text"
                placeholder="myz-sync"
                value={bucket.value}
                onInput={(event: InputEvent) =>
                  (bucket.value = (event.target as HTMLInputElement).value)
                }
              />
            </SettingsRow>
            <SettingsRow label="Access Key ID">
              <input
                type="text"
                value={accessKeyId.value}
                onInput={(event: InputEvent) =>
                  (accessKeyId.value = (event.target as HTMLInputElement).value)
                }
              />
            </SettingsRow>
            <SettingsRow label="Secret Access Key">
              <input
                type="password"
                value={secretAccessKey.value}
                onInput={(event: InputEvent) =>
                  (secretAccessKey.value = (
                    event.target as HTMLInputElement
                  ).value)
                }
              />
            </SettingsRow>
            <SettingsRow
              label="Session Token"
              hint="可选：S3 临时凭证（STS）需要"
            >
              <input
                type="text"
                value={sessionToken.value}
                onInput={(event: InputEvent) =>
                  (sessionToken.value = (
                    event.target as HTMLInputElement
                  ).value)
                }
              />
            </SettingsRow>
            <SettingsRow label="Prefix" hint="可选">
              <input
                type="text"
                placeholder="myz-sync"
                value={prefix.value}
                onInput={(event: InputEvent) =>
                  (prefix.value = (event.target as HTMLInputElement).value)
                }
              />
            </SettingsRow>
          </div>

          <div class="grid gap-4 rounded-control border border-line bg-surface p-4 dark:border-line dark:bg-surface-2">
            <p class="text-caption text-muted">
              {hasAccount.value
                ? "已使用新格式设备绑定账号同步；旧格式密钥与 KeyId 不再需要。"
                : "旧格式密钥：仅用于迁移旧数据；新格式账号使用设备绑定，无需此密钥。"}
            </p>
            {!hasAccount.value ? (
              <SettingsRow label="同步密钥">
                <input
                  type="password"
                  placeholder="仅保留在本地"
                  value={syncSecret.value}
                  onInput={(event: InputEvent) =>
                    (syncSecret.value = (
                      event.target as HTMLInputElement
                    ).value)
                  }
                />
              </SettingsRow>
            ) : null}
            {!hasAccount.value ? (
              <SettingsRow label="当前 KeyId" controlWidth="auto">
                <span class="text-caption text-muted">
                  {keyId.value || "未设置"}
                </span>
              </SettingsRow>
            ) : null}
            <SettingsRow label="上次同步" controlWidth="auto">
              <span class="text-caption text-muted">
                {lastSyncAt.value || "未同步"}
              </span>
            </SettingsRow>
            {!hasAccount.value ? (
              <SettingsRow label="同步版本" controlWidth="auto">
                <span class="text-caption text-muted">
                  {lastManifestVersion.value || 0}
                </span>
              </SettingsRow>
            ) : null}
            {!hasAccount.value ? (
              <SettingsRow label="密钥更新时间" controlWidth="auto">
                <span class="text-caption text-muted">
                  {keyUpdatedAt.value || "-"}
                </span>
              </SettingsRow>
            ) : null}
          </div>

          <div class="grid gap-4 rounded-control border border-line bg-surface p-4 dark:border-line dark:bg-surface-2">
            <SettingsRow label="同步账号" controlWidth="auto">
              <span class="text-caption text-muted">
                {hasAccount.value ? "已建立" : "未建立"}
              </span>
            </SettingsRow>
            {hasAccount.value ? (
              <SettingsRow label="Account ID" controlWidth="auto">
                <span class="text-caption text-muted break-all">
                  {accountId.value}
                </span>
              </SettingsRow>
            ) : null}
            {hasAccount.value ? (
              <SettingsRow label="Device ID" controlWidth="auto">
                <span class="text-caption text-muted break-all">
                  {deviceId.value}
                </span>
              </SettingsRow>
            ) : null}
            {accountRoster.value ? (
              <div>
                <label class="text-caption text-muted">配对串</label>
                <textarea
                  readonly
                  rows={3}
                  class="w-full rounded-control border border-line bg-surface p-2 text-caption"
                  value={accountRoster.value}
                />
              </div>
            ) : null}
            <div class="settings__actions">
              {!hasAccount.value ? (
                <button
                  class="btn"
                  type="button"
                  disabled={isBusy.value}
                  onClick={handleCreateAccount}
                >
                  创建同步账号
                </button>
              ) : null}
              {!hasAccount.value ? (
                <button
                  class="btn"
                  type="button"
                  disabled={isBusy.value}
                  onClick={handleImportAccount}
                >
                  导入账号
                </button>
              ) : null}
              {!hasAccount.value ? (
                <button
                  class="btn"
                  type="button"
                  disabled={isBusy.value}
                  onClick={handleBootstrap}
                >
                  迁移旧数据并创建账号
                </button>
              ) : null}
              {hasAccount.value ? (
                <button
                  class="btn"
                  type="button"
                  disabled={isBusy.value}
                  onClick={handleClearAccount}
                >
                  解除账号
                </button>
              ) : null}
            </div>
          </div>

          <div class="grid gap-3 rounded-control border border-line bg-surface p-4 dark:border-line dark:bg-surface-2">
            <div class="text-caption text-muted">
              设备配对（新格式：用一次性串在此设备与新设备间传递，并核对 6
              位短码）
            </div>
            <div class="grid gap-2">
              <div class="text-caption">
                1. 已授权设备：生成邀请并发送给新设备
              </div>
              <button
                class="btn"
                type="button"
                disabled={isBusy.value}
                onClick={handlePairingInvite}
              >
                生成配对邀请
              </button>
              {pairingInvite.value ? (
                <textarea
                  readonly
                  rows={2}
                  class="w-full rounded-control border border-line bg-surface p-2 text-caption"
                  value={pairingInvite.value}
                />
              ) : null}
            </div>
            <div class="grid gap-2">
              <div class="text-caption">
                2. 新设备：粘贴邀请，生成响应并核对短码
              </div>
              <textarea
                rows={2}
                placeholder="粘贴邀请串"
                class="w-full rounded-control border border-line bg-surface p-2 text-caption"
                value={pairingInviteInput.value}
                onInput={(event: Event) =>
                  (pairingInviteInput.value = (
                    event.target as HTMLTextAreaElement
                  ).value)
                }
              />
              <button
                class="btn"
                type="button"
                disabled={isBusy.value}
                onClick={handleAcceptPairing}
              >
                接受配对邀请
              </button>
              {pairingGuestResponse.value ? (
                <textarea
                  readonly
                  rows={2}
                  class="w-full rounded-control border border-line bg-surface p-2 text-caption"
                  value={pairingGuestResponse.value}
                />
              ) : null}
              {pairingGuestSas.value ? (
                <div class="text-caption">
                  新设备短码：
                  <span class="font-semibold">{pairingGuestSas.value}</span>
                </div>
              ) : null}
            </div>
            <div class="grid gap-2">
              <div class="text-caption">
                3. 已授权设备：粘贴响应并批准（短码须一致）
              </div>
              <textarea
                rows={2}
                placeholder="粘贴响应串"
                class="w-full rounded-control border border-line bg-surface p-2 text-caption"
                value={pairingResponseInput.value}
                onInput={(event: Event) =>
                  (pairingResponseInput.value = (
                    event.target as HTMLTextAreaElement
                  ).value)
                }
              />
              <button
                class="btn"
                type="button"
                disabled={isBusy.value}
                onClick={handleApprovePairing}
              >
                批准并加入设备
              </button>
              {pairingHostSas.value ? (
                <div class="text-caption">
                  本机短码：
                  <span class="font-semibold">{pairingHostSas.value}</span>
                </div>
              ) : null}
              {pairingRoster.value ? (
                <div class="grid gap-1">
                  <div class="text-caption">
                    配对串（短码一致后发回新设备，用「导入账号」粘贴）
                  </div>
                  <textarea
                    readonly
                    rows={2}
                    class="w-full rounded-control border border-line bg-surface p-2 text-caption"
                    value={pairingRoster.value}
                  />
                </div>
              ) : null}
            </div>
          </div>

          <div class="settings__actions">
            <button
              class="btn"
              type="button"
              disabled={isBusy.value}
              onClick={handleSaveSettings}
            >
              保存设置
            </button>
            <button
              class="btn"
              type="button"
              disabled={isBusy.value}
              onClick={handleTestConnection}
            >
              测试连接
            </button>
            {!hasAccount.value ? (
              <button
                class="btn"
                type="button"
                disabled={isBusy.value}
                onClick={handleSetKey}
              >
                设置密钥
              </button>
            ) : null}
            <button
              class="btn"
              type="button"
              disabled={isBusy.value || !enabled.value}
              onClick={handleSyncNow}
            >
              立即同步
            </button>
            <p
              class={[
                "status-line",
                tone.value === "error"
                  ? " status-line--error"
                  : tone.value === "success"
                    ? " status-line--success"
                    : "",
              ].join(" ")}
            >
              {status.value}
            </p>
          </div>
        </div>
      </section>
    );
  },
});
