import { sendMessage } from "@myz/shared/messaging";
import { onMounted, ref, watchEffect } from "vue";
import { useRouter } from "vue-router";
import { useSettingsStore } from "../../stores/settings.js";
import type {
  SyncNowMessageResult,
  SyncStatusMessageResult,
  SyncTestConnectionMessageResult,
} from "@/background/messages/sync";

type StatusTone = "info" | "error" | "success";

/** State + message handlers for the sync settings section. */
export function useSyncSection() {
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
        sync: { enabled: enabled.value, s3: buildS3Payload() },
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

  return {
    enabled,
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    sessionToken,
    prefix,
    syncSecret,
    status,
    tone,
    isBusy,
    keyId,
    keyUpdatedAt,
    lastSyncAt,
    lastManifestVersion,
    hasAccount,
    accountId,
    deviceId,
    accountEpoch,
    handleSaveSettings,
    handleTestConnection,
    handleSetKey,
    handleSyncNow,
    handleClearAccount,
    openSetup,
  };
}

export type SyncSectionApi = ReturnType<typeof useSyncSection>;
