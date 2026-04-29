import type {
  DashboardHost,
  DashboardTheme,
  ImportStrategy,
  RecordExportResult,
  RecordImportResult,
  RecordQuery,
  SyncConfig,
  SyncRunReason,
  SyncRunResult,
  SyncStatus,
} from "@myz/dashboard-core/host";
import { DASHBOARD_HOST_CAPABILITY_PRESETS } from "@myz/dashboard-core/host";
import type { MyZRecord } from "@myz/shared/types";
import { invoke } from "@tauri-apps/api/core";

export interface DesktopSettings {
  dashboardView: "cards" | "list";
  colorPalette: string[];
  lastUsedColor: string;
  lastUsedStyle: string;
}

async function listRecords(_query?: RecordQuery): Promise<MyZRecord[]> {
  return invoke<MyZRecord[]>("desktop_list_records");
}

async function getRecord(recordId: string): Promise<MyZRecord | null> {
  return invoke<MyZRecord | null>("desktop_get_record", { recordId });
}

async function saveRecord(record: MyZRecord): Promise<MyZRecord> {
  return invoke<MyZRecord>("desktop_save_record", { record });
}

async function saveRecords(records: MyZRecord[]): Promise<MyZRecord[]> {
  return invoke<MyZRecord[]>("desktop_save_records", { records });
}

async function removeRecords(recordIds: string[]): Promise<void> {
  return invoke("desktop_remove_records", { recordIds });
}

async function exportRecords(): Promise<RecordExportResult> {
  return invoke<RecordExportResult>("desktop_export_records");
}

async function importRecords(input: {
  records: MyZRecord[];
  strategy: ImportStrategy;
}): Promise<RecordImportResult> {
  return invoke<RecordImportResult>("desktop_import_records", { input });
}

async function getSettings(): Promise<DesktopSettings> {
  return invoke<DesktopSettings>("desktop_get_settings");
}

async function updateSettings(
  patch: Partial<DesktopSettings>,
): Promise<DesktopSettings> {
  return invoke<DesktopSettings>("desktop_update_settings", { patch });
}

async function getTheme(): Promise<DashboardTheme | null> {
  return invoke<DashboardTheme | null>("desktop_get_theme");
}

async function setTheme(theme: DashboardTheme): Promise<void> {
  return invoke("desktop_set_theme", { theme });
}

async function getSyncConfig(): Promise<SyncConfig> {
  return invoke<SyncConfig>("desktop_get_sync_config");
}

async function updateSyncConfig(
  patch: Partial<SyncConfig>,
): Promise<SyncConfig> {
  return invoke<SyncConfig>("desktop_update_sync_config", { patch });
}

async function getSyncStatus(): Promise<SyncStatus> {
  return invoke<SyncStatus>("desktop_get_sync_status");
}

async function runSync(reason?: SyncRunReason): Promise<SyncRunResult> {
  return invoke<SyncRunResult>("desktop_run_sync", { reason });
}

export function createDesktopDashboardHost(): DashboardHost<DesktopSettings> {
  return {
    kind: "desktop",
    capabilities: DASHBOARD_HOST_CAPABILITY_PRESETS.desktop,
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
    },
    sync: {
      getConfig: getSyncConfig,
      updateConfig: updateSyncConfig,
      getStatus: getSyncStatus,
      runSync,
    },
  };
}
