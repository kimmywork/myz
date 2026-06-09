import type { KnowledgeLayer } from "./types"
import type { MyZRecord } from "./recordsAdapter"
import { loadRecords, loadRecordsSince } from "./recordsAdapter"
import { classifyRecord } from "./recordClassifier"
import { createEntry, loadIndex, saveIndex, searchEntries } from "./knowledgeStore"

export interface IngestOptions {
  knowledgeDir: string
  appDataDir?: string
  limit?: number
  dryRun?: boolean
}

export interface IngestResult {
  processed: number
  created: number
  skipped: number
  errors: string[]
}

export function ingestRecords(options: IngestOptions): IngestResult {
  const { knowledgeDir, appDataDir, limit, dryRun } = options
  const index = loadIndex(knowledgeDir)
  const result: IngestResult = { processed: 0, created: 0, skipped: 0, errors: [] }

  let records: MyZRecord[]
  if (index.lastIngestedAt) {
    records = loadRecordsSince(index.lastIngestedAt, { appDataDir })
  } else {
    const snapshot = loadRecords({ appDataDir })
    records = snapshot.records
  }

  if (limit) {
    records = records.slice(0, limit)
  }

  for (const record of records) {
    result.processed++

    try {
      const existing = searchEntries(knowledgeDir, record.id)
      if (existing.some((e) => e.sourceRecordIds.includes(record.id))) {
        result.skipped++
        continue
      }

      const classification = classifyRecord(record)
      const title = record.title || record.text?.slice(0, 80) || record.id
      const body = [record.text, record.note].filter(Boolean).join("\n\n")

      if (!body.trim()) {
        result.skipped++
        continue
      }

      if (!dryRun) {
        createEntry(knowledgeDir, classification.layer, {
          title,
          body,
          tags: record.tags || [],
          sourceRecordIds: [record.id],
          sourceUrls: record.sourceUrl ? [record.sourceUrl] : [],
          confidence: classification.confidence,
          expiresAt:
            classification.layer === "ops"
              ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
              : undefined,
        })
      }

      result.created++
    } catch (error) {
      result.errors.push(`Record ${record.id}: ${(error as Error).message}`)
    }
  }

  if (!dryRun && result.created > 0) {
    const updatedIndex = loadIndex(knowledgeDir)
    updatedIndex.lastIngestedAt = new Date().toISOString()
    if (records.length > 0) {
      updatedIndex.lastIngestedRecordId = records[records.length - 1]?.id
    }
    saveIndex(knowledgeDir, updatedIndex)
  }

  return result
}

export function getIngestStatus(knowledgeDir: string, appDataDir?: string): {
  lastIngestedAt?: string
  lastIngestedRecordId?: string
  totalRecords: number
  totalKnowledgeEntries: number
} {
  const index = loadIndex(knowledgeDir)
  const snapshot = loadRecords({ appDataDir })
  return {
    lastIngestedAt: index.lastIngestedAt,
    lastIngestedRecordId: index.lastIngestedRecordId,
    totalRecords: snapshot.recordCount,
    totalKnowledgeEntries: index.entries.length,
  }
}
