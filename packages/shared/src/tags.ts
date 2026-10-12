import type { MyZRecord } from "./types.ts"

/**
 * Normalize a list of tag candidates: keep only strings, trim them, drop
 * empties, and de-duplicate while preserving first-seen order.
 */
export function normalizeTags(tags: readonly unknown[] | undefined): string[] {
  if (!Array.isArray(tags)) {
    return []
  }
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of tags) {
    if (typeof value !== "string") {
      continue
    }
    const tag = value.trim()
    if (!tag || seen.has(tag)) {
      continue
    }
    seen.add(tag)
    result.push(tag)
  }
  return result
}

/**
 * De-duplicated union of any number of tag lists, sorted for stable display.
 */
export function mergeTags(
  ...lists: Array<readonly unknown[] | undefined>
): string[] {
  const merged = new Set<string>()
  lists.forEach((list) => {
    normalizeTags(list).forEach((tag) => merged.add(tag))
  })
  return Array.from(merged).sort((a, b) => a.localeCompare(b))
}

/**
 * Sorted, de-duplicated tags collected from a list of records.
 */
export function collectTags(
  records: ReadonlyArray<Partial<MyZRecord> | null | undefined>,
): string[] {
  const merged = new Set<string>()
  records.forEach((record) => {
    normalizeTags(record?.tags).forEach((tag) => merged.add(tag))
  })
  return Array.from(merged).sort((a, b) => a.localeCompare(b))
}

/**
 * Tag frequency across records, sorted by count (desc) then tag (asc).
 */
export function countTags(
  records: ReadonlyArray<Partial<MyZRecord> | null | undefined>,
): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>()
  records.forEach((record) => {
    normalizeTags(record?.tags).forEach((tag) => {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    })
  })
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}
