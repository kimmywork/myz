import { SettingsRow } from "@myz/dashboard-ui";
import { sendMessage } from "@myz/shared/messaging";
import { defineComponent, onMounted, ref, watchEffect } from "vue";
import { useRouter } from "vue-router";
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
    const router = useRouter();

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
      if (
        !window.confirm(
          "更改同步密钥会触发密钥轮换，旧密钥数据将无法继续解密。确定继续？",
        )
      ) {
        setStatus("已取消", "info");
        return;
      }
      isBusy.value = true;
      setStatus("设置密钥中…", "info");
      try {
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
        await refreshSyncStatus();
        setStatus("已解除同步账号", "success");
      } catch (error) {
        setStatus(`操作失败：${(error as Error).message}`, "error");
      } finally {
        isBusy.value = false;
      }
    }

    function openSetup(scenario?: "authorize") {
      void router.push(scenario ? `/setup?scenario=${scenario}` : "/setup");
    }

    onMounted(async () => {
      await settingsStore.loadSettings().catch(() => {});
      await refreshSyncStatus();
      if (!hasAccount.value && !settingsStore.settings.syncSetupSeen) {
        void router.replace("/setup");
      }
    });

    return () => (
      <section class="settings__group">
        <div class="settings__group-header">
          <h3>加密同步</h3>
        </div>
        <div class="settings__fields">
          <p class="settings__hint">
            {hasAccount.value
              ? "已使用新格式设备绑定账号同步；旧格式密钥与 KeyId 不再需要。"
              : "仅密文存储到 S3。旧格式密钥仅用于迁移旧数据，新格式账号使用设备绑定。"}
          </p>

          <div class="grid gap-4 rounded-control border border-line bg-surface p-4 dark:border-line dark:bg-surface-2">
            <SettingsRow label="同步账号" controlWidth="auto">
              <span class="flex items-center gap-2">
                <span class="text-caption text-muted">
                  {hasAccount.value ? "已建立" : "未建立"}
                </span>
                {hasAccount.value && !lastSyncAt.value ? (
                  <span class="settings__pill settings__pill--info">
                    未完成同步
                  </span>
                ) : null}
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
                  {deviceId.value || "-"}
                </span>
              </SettingsRow>
            ) : null}
            {hasAccount.value ? (
              <SettingsRow label="Epoch" controlWidth="auto">
                <span class="text-caption text-muted">
                  {accountEpoch.value}
                </span>
              </SettingsRow>
            ) : null}
            <SettingsRow label="上次同步" controlWidth="auto">
              <span class="text-caption text-muted">
                {lastSyncAt.value || "未同步"}
              </span>
            </SettingsRow>
          </div>

          <div class="settings__actions">
            {!hasAccount.value ? (
              <button
                class="btn btn-primary"
                type="button"
                disabled={isBusy.value}
                onClick={() => openSetup()}
              >
                设置同步
              </button>
            ) : (
              <>
                <button
                  class="btn"
                  type="button"
                  disabled={isBusy.value}
                  onClick={handleSyncNow}
                >
                  立即同步
                </button>
                <button
                  class="btn"
                  type="button"
                  disabled={isBusy.value}
                  onClick={() => openSetup("authorize")}
                >
                  添加设备
                </button>
                <button
                  class="btn btn-danger"
                  type="button"
                  disabled={isBusy.value}
                  onClick={handleClearAccount}
                >
                  解除账号
                </button>
              </>
            )}
          </div>

          <details class="rounded-control border border-line bg-surface p-4 dark:border-line dark:bg-surface-2">
            <summary class="cursor-pointer text-compact font-medium text-text">
              高级设置
            </summary>
            <div class="mt-4 grid gap-4">
              <SettingsRow label="启用同步" controlWidth="auto">
                <ToggleSwitch
                  checked={enabled.value}
                  ariaLabel="启用同步"
                  onChange={(event: Event) =>
                    (enabled.value = (event.target as HTMLInputElement).checked)
                  }
                />
              </SettingsRow>
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
                    (accessKeyId.value = (
                      event.target as HTMLInputElement
                    ).value)
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
              </div>
            </div>
          </details>

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
      </section>
    );
  },
});
