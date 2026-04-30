import type { MyZRecord } from "@myz/shared/types"

export const DASHBOARD_HOST_KINDS = [
  "extension",
  "desktop",
  "mobile-extension",
] as const

export type DashboardHostKind = (typeof DASHBOARD_HOST_KINDS)[number]
export type DashboardTheme = "light" | "dark"
export type ImportStrategy = "skip" | "overwrite" | "latest"
export type SyncProviderKind = "s3"
export type SyncState = "idle" | "syncing" | "error"
export type SyncRunReason = "manual" | "scheduled" | "startup" | "background"

export interface DashboardHostCapabilities {
  localFileStorage: boolean
  sync: boolean
  themePersistence: boolean
  backgroundMessaging: boolean
  windowControls: boolean
  touchOptimized: boolean
}

export interface DashboardHostFeatures {
  socialImport: boolean
  providerConnectionTesting: boolean
  mcpConnectionTesting: boolean
  skillManagement: boolean
  vectorMaintenance: boolean
  localChatRuntime: boolean
}

export const DASHBOARD_HOST_CAPABILITY_PRESETS: Record<
  DashboardHostKind,
  DashboardHostCapabilities
> = {
  extension: {
    localFileStorage: false,
    sync: true,
    themePersistence: true,
    backgroundMessaging: true,
    windowControls: false,
    touchOptimized: false,
  },
  desktop: {
    localFileStorage: true,
    sync: true,
    themePersistence: true,
    backgroundMessaging: false,
    windowControls: true,
    touchOptimized: false,
  },
  "mobile-extension": {
    localFileStorage: false,
    sync: true,
    themePersistence: true,
    backgroundMessaging: true,
    windowControls: false,
    touchOptimized: true,
  },
}

export const DASHBOARD_HOST_FEATURE_PRESETS: Record<
  DashboardHostKind,
  DashboardHostFeatures
> = {
  extension: {
    socialImport: true,
    providerConnectionTesting: true,
    mcpConnectionTesting: true,
    skillManagement: true,
    vectorMaintenance: true,
    localChatRuntime: false,
  },
  desktop: {
    socialImport: false,
    providerConnectionTesting: true,
    mcpConnectionTesting: true,
    skillManagement: false,
    vectorMaintenance: false,
    localChatRuntime: true,
  },
  "mobile-extension": {
    socialImport: false,
    providerConnectionTesting: false,
    mcpConnectionTesting: false,
    skillManagement: false,
    vectorMaintenance: false,
    localChatRuntime: false,
  },
}

export interface RecordQuery {
  ids?: string[]
  kinds?: string[]
  tags?: string[]
  hostname?: string
  pageUrl?: string
  searchText?: string
  limit?: number
  cursor?: string | null
}

export interface RecordExportResult {
  markdown: string
  json: string
}

export interface RecordImportResult {
  inserted: number
  replaced: number
  skipped: number
}

export interface RecordRepository {
  listRecords(query?: RecordQuery): Promise<MyZRecord[]>
  getRecord(recordId: string): Promise<MyZRecord | null>
  saveRecord(record: MyZRecord): Promise<MyZRecord>
  saveRecords(records: MyZRecord[]): Promise<MyZRecord[]>
  removeRecords(recordIds: string[]): Promise<void>
  exportRecords(): Promise<RecordExportResult>
  importRecords(input: {
    records: MyZRecord[]
    strategy: ImportStrategy
  }): Promise<RecordImportResult>
}

export interface SettingsRepository<TSettings = unknown> {
  getSettings(): Promise<TSettings>
  updateSettings(patch: Partial<TSettings>): Promise<TSettings>
}

export type ThemeListener = (theme: DashboardTheme) => void

export interface ThemeRepository {
  getTheme(): Promise<DashboardTheme | null>
  setTheme(theme: DashboardTheme): Promise<void>
  watchTheme?(listener: ThemeListener): () => void
}

export interface SyncS3Config {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  prefix?: string
}

export interface SyncConfig {
  enabled: boolean
  provider: SyncProviderKind
  s3: SyncS3Config
}

export interface SyncStatus {
  enabled: boolean
  state: SyncState
  lastSyncAt?: string | null
  pendingRecords?: number
  lastError?: string | null
}

export interface SyncRunResult {
  ok: boolean
  state: SyncState
  syncedRecords?: number
  skippedRecords?: number
  finishedAt?: string
  message?: string
}

export interface SyncRepository {
  getConfig(): Promise<SyncConfig>
  updateConfig(patch: Partial<SyncConfig>): Promise<SyncConfig>
  getStatus(): Promise<SyncStatus>
  runSync(reason?: SyncRunReason): Promise<SyncRunResult>
}

export interface DashboardHost<TSettings = unknown> {
  kind: DashboardHostKind
  capabilities: DashboardHostCapabilities
  features: DashboardHostFeatures
  records: RecordRepository
  settings: SettingsRepository<TSettings>
  theme: ThemeRepository
  sync?: SyncRepository
}
