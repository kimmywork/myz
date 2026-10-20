import type { useSettingsStore } from "../../stores/settings.js";
import { toS3Form, validateS3Form } from "./SetupS3Fields.jsx";
import type { WizardState } from "./wizard-state.js";
import { invoke } from "@/messaging/invoke";

type SettingsStore = ReturnType<typeof useSettingsStore>;

/** S3, migration, account creation and first-sync handlers. */
export function createAccountActions(
  state: WizardState,
  settingsStore: SettingsStore,
) {
  function s3FromSettings() {
    Object.assign(state.s3, toS3Form(settingsStore.settings.sync?.s3));
  }

  async function loadStatus() {
    try {
      const result = await invoke("myz:syncStatus");
      state.hasAccount.value = Boolean(result?.hasAccount);
      state.accountId.value = result?.accountId || null;
      state.deviceId.value = result?.deviceId || null;
      state.epoch.value = result?.epoch || 0;
      state.lastSyncAt.value = result?.lastSyncAt || null;
    } catch (error) {
      state.setStatus(`读取同步状态失败：${(error as Error).message}`, "error");
    }
  }

  async function persistS3(): Promise<boolean> {
    const error = validateS3Form(state.s3);
    if (error) {
      state.setStatus(error, "error");
      return false;
    }
    // Merge the current sync settings so re-running the wizard does not reset
    // advanced tuning fields (keepManifests / lockLeaseMs).
    await settingsStore.saveSettings({
      sync: {
        ...settingsStore.settings.sync,
        enabled: true,
        s3: { ...state.s3 },
      },
    });
    return true;
  }

  async function handleTestConnection() {
    const error = validateS3Form(state.s3);
    if (error) {
      state.s3Tested.value = false;
      state.setStatus(error, "error");
      return;
    }
    state.isBusy.value = true;
    state.setStatus("测试连接中…", "info");
    try {
      const result = await invoke("myz:syncTestConnection", {
        s3: { ...state.s3 },
      });
      state.s3Tested.value = Boolean(result?.ok);
      state.setStatus(
        result?.ok ? "连接成功" : result?.message || "连接失败",
        result?.ok ? "success" : "error",
      );
    } catch (err) {
      state.s3Tested.value = false;
      state.setStatus(`连接失败：${(err as Error).message}`, "error");
    } finally {
      state.isBusy.value = false;
    }
  }

  async function saveS3AndGo(target: number) {
    if (state.isBusy.value) return;
    state.isBusy.value = true;
    try {
      if (!(await persistS3())) return;
      state.step.value = target;
      state.s3Tested.value = true;
      state.setStatus("", "info");
    } catch (err) {
      state.setStatus(`保存失败：${(err as Error).message}`, "error");
    } finally {
      state.isBusy.value = false;
    }
  }

  async function handleCreateAccount() {
    if (state.isBusy.value) return;
    state.isBusy.value = true;
    state.setStatus("创建账号中…", "info");
    try {
      const result = await invoke("myz:accountCreate", { userGesture: true });
      state.createdAccountId.value = result.accountId;
      await loadStatus();
      state.setStatus("账号已创建", "success");
    } catch (err) {
      state.setStatus(`创建账号失败：${(err as Error).message}`, "error");
    } finally {
      state.isBusy.value = false;
    }
  }

  async function handleSyncNow() {
    if (state.isBusy.value) return;
    state.isBusy.value = true;
    state.syncState.value = "running";
    state.setStatus("正在上传本机数据…", "info");
    try {
      const result = await invoke("myz:syncNow");
      if (result?.ok) {
        await loadStatus();
        state.syncState.value = "done";
        state.setStatus("首次同步完成", "success");
      } else {
        state.syncState.value = "failed";
        state.setStatus(result?.message || "同步失败", "error");
      }
    } catch (err) {
      state.syncState.value = "failed";
      state.setStatus(`同步失败：${(err as Error).message}`, "error");
    } finally {
      state.isBusy.value = false;
    }
  }

  function handleSyncLater() {
    state.syncState.value = "later";
    state.setStatus("已保存，可稍后在设置页同步", "warn");
  }

  return {
    s3FromSettings,
    loadStatus,
    persistS3,
    handleTestConnection,
    saveS3AndGo,
    handleCreateAccount,
    handleSyncNow,
    handleSyncLater,
  };
}

export type AccountActions = ReturnType<typeof createAccountActions>;
