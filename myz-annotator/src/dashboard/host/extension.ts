import type {
  DashboardHost,
  DashboardTheme,
  RecordExportResult,
  RecordImportResult,
  RecordQuery,
  SyncConfig,
  SyncRunReason,
  SyncRunResult,
  SyncStatus,
} from "@myz/dashboard-core/host";
import {
  DASHBOARD_HOST_CAPABILITY_PRESETS,
  DASHBOARD_HOST_FEATURE_PRESETS,
} from "@myz/dashboard-core/host";
import type { MyZRecord } from "@myz/shared/types";
import type { Settings } from "@/background/settings";
import { invoke } from "@/messaging/invoke";

const THEME_STORAGE_KEY = "myz:theme";

function readChromeStorage<T>(key: string): Promise<T | null> {
  return new Promise((resolve, reject) => {
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      reject(new Error("Chrome storage not available"));
      return;
    }
    chrome.storage.local.get([key], (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve((result?.[key] as T | undefined) ?? null);
    });
  });
}

function writeChromeStorage<T>(key: string, value: T): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      reject(new Error("Chrome storage not available"));
      return;
    }
    chrome.storage.local.set({ [key]: value }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

async function listRecords(_query?: RecordQuery): Promise<MyZRecord[]> {
  return invoke("myz:getAllHighlights");
}

async function getRecord(recordId: string): Promise<MyZRecord | null> {
  const records = await listRecords();
  return records.find((record) => record.id === recordId) ?? null;
}

async function saveRecord(record: MyZRecord): Promise<MyZRecord> {
  return invoke("myz:saveHighlight", record);
}

async function saveRecords(records: MyZRecord[]): Promise<MyZRecord[]> {
  return Promise.all(records.map((record) => saveRecord(record)));
}

async function removeRecords(recordIds: string[]): Promise<void> {
  if (!recordIds.length) {
    return;
  }
  if (recordIds.length === 1) {
    await invoke("myz:removeHighlight", { id: recordIds[0] });
    return;
  }
  await invoke("myz:removeRecordsByIds", { ids: recordIds });
}

async function exportRecords(): Promise<RecordExportResult> {
  return invoke("myz:export");
}

async function importRecords(input: {
  records: MyZRecord[];
  strategy: "skip" | "overwrite" | "latest";
}): Promise<RecordImportResult> {
  return invoke("myz:importHighlights", input);
}

async function getSettings(): Promise<Settings> {
  return invoke("myz:getSettings");
}

async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  return invoke("myz:updateSettings", patch);
}

async function getTheme(): Promise<DashboardTheme | null> {
  const theme = await readChromeStorage<string>(THEME_STORAGE_KEY);
  return theme === "light" ? "light" : theme === "dark" ? "dark" : null;
}

async function setTheme(theme: DashboardTheme): Promise<void> {
  await writeChromeStorage(THEME_STORAGE_KEY, theme);
}

function watchTheme(listener: (theme: DashboardTheme) => void): () => void {
  if (
    typeof chrome === "undefined" ||
    !chrome.storage?.onChanged ||
    typeof chrome.storage.onChanged.addListener !== "function"
  ) {
    return () => {};
  }
  const onChanged = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== "local" || !changes?.[THEME_STORAGE_KEY]) {
      return;
    }
    const nextValue = changes[THEME_STORAGE_KEY].newValue;
    if (nextValue === "light" || nextValue === "dark") {
      listener(nextValue);
    }
  };
  chrome.storage.onChanged.addListener(onChanged);
  return () => {
    chrome.storage.onChanged.removeListener(onChanged);
  };
}

async function getSyncConfig(): Promise<SyncConfig> {
  const settings = await getSettings();
  return {
    enabled: Boolean(settings.sync?.enabled),
    provider: "s3",
    s3: settings.sync.s3,
  };
}

async function updateSyncConfig(
  patch: Partial<SyncConfig>,
): Promise<SyncConfig> {
  const current = await getSyncConfig();
  const nextSync = {
    enabled:
      typeof patch.enabled === "boolean" ? patch.enabled : current.enabled,
    s3: {
      ...current.s3,
      ...(patch.s3 || {}),
    },
  };
  const updated = await updateSettings({
    sync: nextSync,
  });
  return {
    enabled: Boolean(updated.sync?.enabled),
    provider: "s3",
    s3: updated.sync.s3,
  };
}

async function getSyncStatus(): Promise<SyncStatus> {
  const [config, status] = await Promise.all([
    getSyncConfig(),
    invoke("myz:syncStatus"),
  ]);
  return {
    enabled: config.enabled,
    state: "idle",
    lastSyncAt: status.lastSyncAt,
    pendingRecords: undefined,
    lastError: null,
    lastManifestVersion: status.lastManifestVersion,
  };
}

async function testSyncConnection(
  config?: Partial<SyncConfig>,
): Promise<{ ok: boolean; message?: string }> {
  return invoke(
    "myz:syncTestConnection",
    config?.s3 ? { s3: config.s3 } : undefined,
  );
}

async function runSync(_reason?: SyncRunReason): Promise<SyncRunResult> {
  const result = await invoke("myz:syncNow");
  return {
    ok: Boolean(result.ok),
    state: result.ok ? "idle" : "error",
    syncedRecords: undefined,
    skippedRecords: undefined,
    finishedAt: new Date().toISOString(),
    message: result.message,
  };
}

export function createExtensionDashboardHost(): DashboardHost<Settings> {
  return {
    kind: "extension",
    capabilities: DASHBOARD_HOST_CAPABILITY_PRESETS.extension,
    features: DASHBOARD_HOST_FEATURE_PRESETS.extension,
    records: {
      listRecords,
      getRecord,
      saveRecord,
      saveRecords,
      removeRecords,
      exportRecords,
      importRecords,
    },
    settings: {
      getSettings,
      updateSettings,
    },
    theme: {
      getTheme,
      setTheme,
      watchTheme,
    },
    sync: {
      getConfig: getSyncConfig,
      updateConfig: updateSyncConfig,
      getStatus: getSyncStatus,
      testConnection: testSyncConnection,
      runSync,
    },
  };
}
