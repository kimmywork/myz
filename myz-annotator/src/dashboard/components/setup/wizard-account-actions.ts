import type { useSettingsStore } from "../../stores/settings.js";
import { toS3Form, validateS3Form } from "./SetupS3Fields.jsx";
import type { WizardState } from "./wizard-state.js";
import { invoke } from "@/messaging/invoke";

type SettingsStore = ReturnType<typeof useSettingsStore>;

/** Copies the saved S3 settings into the wizard form. */
function s3FromSettings(state: WizardState, settingsStore: SettingsStore) {
  Object.assign(state.s3, toS3Form(settingsStore.settings.sync?.s3));
}

/** Loads account/device status into the wizard state. */
async function loadSyncStatus(state: WizardState) {
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

/** Validates and saves the S3 form without resetting tuning fields. */
async function persistS3(
  state: WizardState,
  settingsStore: SettingsStore,
): Promise<boolean> {
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

/** Tests the S3 form and records the result on the wizard state. */
async function testConnection(state: WizardState) {
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

/** Persists S3 settings and advances to the requested step. */
async function saveS3AndGo(
  state: WizardState,
  persist: () => Promise<boolean>,
  target: number,
) {
  if (state.isBusy.value) return;
  state.isBusy.value = true;
  try {
    if (!(await persist())) return;
    state.step.value = target;
    state.s3Tested.value = true;
    state.setStatus("", "info");
  } catch (err) {
    state.setStatus(`保存失败：${(err as Error).message}`, "error");
  } finally {
    state.isBusy.value = false;
  }
}

/** Creates the account and refreshes the wizard status. */
async function createAccount(
  state: WizardState,
  loadStatus: () => Promise<void>,
) {
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

/** Runs the first sync and updates the wizard status. */
async function syncNow(state: WizardState, loadStatus: () => Promise<void>) {
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

/** Marks the first sync as deferred. */
function syncLater(state: WizardState) {
  state.syncState.value = "later";
  state.setStatus("已保存，可稍后在设置页同步", "warn");
}

/** S3, migration, account creation and first-sync handlers. */
export function createAccountActions(
  state: WizardState,
  settingsStore: SettingsStore,
) {
  const loadStatus = () => loadSyncStatus(state);
  const persist = () => persistS3(state, settingsStore);
  return {
    s3FromSettings: () => s3FromSettings(state, settingsStore),
    loadStatus,
    persistS3: persist,
    handleTestConnection: () => testConnection(state),
    saveS3AndGo: (target: number) => saveS3AndGo(state, persist, target),
    handleCreateAccount: () => createAccount(state, loadStatus),
    handleSyncNow: () => syncNow(state, loadStatus),
    handleSyncLater: () => syncLater(state),
  };
}

export type AccountActions = ReturnType<typeof createAccountActions>;
