import { existsSync, readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"
import { homedir } from "node:os"

export interface MyZRecord {
  id: string
  kind: string
  text: string
  html?: string
  note?: string
  tags?: string[]
  sourceUrl?: string
  title?: string
  hostname?: string
  createdAt?: string
  updatedAt?: string
  url?: string
  contentType?: string
  [key: string]: unknown
}

export interface RecordsAdapterConfig {
  appDataDir?: string
}

export interface RecordsSnapshot {
  records: MyZRecord[]
  recordCount: number
  lastModified: string
  filePath: string
}

export function resolveDesktopRecordsPath(appDataDir?: string): string {
  const base =
    appDataDir ||
    resolve(
      homedir(),
      process.platform === "darwin" ? "Library/Application Support" : ".local/share",
      "com.myz.desktop",
    )
  return resolve(base, "dashboard", "records.json")
}

export function loadRecords(config?: RecordsAdapterConfig): RecordsSnapshot {
  const filePath = resolveDesktopRecordsPath(config?.appDataDir)
  if (!existsSync(filePath)) {
    return { records: [], recordCount: 0, lastModified: "", filePath }
  }
  const stat = statSync(filePath)
  const raw = readFileSync(filePath, "utf-8")
  const records = JSON.parse(raw) as MyZRecord[]
  return {
    records,
    recordCount: records.length,
    lastModified: stat.mtime.toISOString(),
    filePath,
  }
}

export function loadRecordsSince(since: string, config?: RecordsAdapterConfig): MyZRecord[] {
  const { records } = loadRecords(config)
  const sinceTime = Date.parse(since)
  return records.filter((record) => {
    const created = Date.parse(record.createdAt || "")
    const updated = Date.parse(record.updatedAt || "")
    return (
      (Number.isFinite(created) && created > sinceTime) ||
      (Number.isFinite(updated) && updated > sinceTime)
    )
  })
}
