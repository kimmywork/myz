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
        await sendMessage("myz:syncSetKey", {
          secret: syncSecret.value.trim(),
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
            仅密文存储到 S3。请先保存 S3 配置，再设置同步密钥。
          </p>

          <div class="flex items-center justify-between rounded-control border border-line bg-surface/90 p-3 text-compact text-muted dark:border-line dark:bg-surface-2 dark:text-muted">
            <span>启用同步</span>
            <ToggleSwitch
              checked={enabled.value}
              ariaLabel="启用同步"
              onChange={(event: Event) =>
                (enabled.value = (event.target as HTMLInputElement).checked)
              }
            />
          </div>

          <div class="grid gap-3 rounded-control border border-line bg-surface/90 p-4 dark:border-line dark:bg-surface-2">
            <label class="field">
              <span>S3 Endpoint</span>
              <input
                type="url"
                placeholder="https://s3.example.com"
                value={endpoint.value}
                onInput={(event: InputEvent) =>
                  (endpoint.value = (event.target as HTMLInputElement).value)
                }
              />
            </label>
            <label class="field">
              <span>Region</span>
              <input
                type="text"
                placeholder="us-east-1"
                value={region.value}
                onInput={(event: InputEvent) =>
                  (region.value = (event.target as HTMLInputElement).value)
                }
              />
            </label>
            <label class="field">
              <span>Bucket</span>
              <input
                type="text"
                placeholder="myz-sync"
                value={bucket.value}
                onInput={(event: InputEvent) =>
                  (bucket.value = (event.target as HTMLInputElement).value)
                }
              />
            </label>
            <label class="field">
              <span>Access Key ID</span>
              <input
                type="text"
                value={accessKeyId.value}
                onInput={(event: InputEvent) =>
                  (accessKeyId.value = (event.target as HTMLInputElement).value)
                }
              />
            </label>
            <label class="field">
              <span>Secret Access Key</span>
              <input
                type="password"
                value={secretAccessKey.value}
                onInput={(event: InputEvent) =>
                  (secretAccessKey.value = (
                    event.target as HTMLInputElement
                  ).value)
                }
              />
            </label>
            <label class="field">
              <span>Session Token (可选)</span>
              <input
                type="text"
                value={sessionToken.value}
                onInput={(event: InputEvent) =>
                  (sessionToken.value = (
                    event.target as HTMLInputElement
                  ).value)
                }
              />
            </label>
            <label class="field">
              <span>Prefix (可选)</span>
              <input
                type="text"
                placeholder="myz-sync"
                value={prefix.value}
                onInput={(event: InputEvent) =>
                  (prefix.value = (event.target as HTMLInputElement).value)
                }
              />
            </label>
          </div>

          <div class="grid gap-3 rounded-control border border-line bg-surface/90 p-4 dark:border-line dark:bg-surface-2">
            <label class="field">
              <span>同步密钥</span>
              <input
                type="password"
                placeholder="仅保留在本地"
                value={syncSecret.value}
                onInput={(event: InputEvent) =>
                  (syncSecret.value = (event.target as HTMLInputElement).value)
                }
              />
            </label>
            <div class="text-caption text-muted">
              当前 KeyId：{keyId.value || "未设置"}
            </div>
            <div class="text-caption text-muted">
              上次同步：{lastSyncAt.value || "未同步"}
            </div>
            <div class="text-caption text-muted">
              Manifest 版本：{lastManifestVersion.value || 0}
            </div>
            <div class="text-caption text-muted">
              密钥更新时间：{keyUpdatedAt.value || "-"}
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
            <button
              class="btn"
              type="button"
              disabled={isBusy.value}
              onClick={handleSetKey}
            >
              设置密钥
            </button>
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
