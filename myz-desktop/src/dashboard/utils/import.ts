import { type MyZRecord, RECORD_KINDS } from "@myz/shared"
import { normalizeRecord } from "./records"

const IMPORTED_TAG = "imported"

export type ImportFileFormat =
  | "json"
  | "raindrop"
  | "chrome-bookmarks"
  | "weava"

export type ImportSource =
  | "auto"
  | "myz-json"
  | "raindrop-csv"
  | "chrome-bookmarks"
  | "weava-csv"

export function normalizeImportedPayload(payload: unknown): MyZRecord[] {
  let rawItems: unknown[] = []
  if (Array.isArray(payload)) {
    rawItems = payload
  } else if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { highlights?: unknown[] }).highlights)
  ) {
    rawItems = (payload as { highlights: unknown[] }).highlights
  } else if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { data?: unknown[] }).data)
  ) {
    rawItems = (payload as { data: unknown[] }).data
  }

  return rawItems
    .map((item) => normalizeRecord(item))
    .filter((item): item is MyZRecord => item !== null)
}

export function appendImportedTag(records: MyZRecord[]): MyZRecord[] {
  return records.map((record) => {
    const rawTags = Array.isArray(record.tags) ? record.tags : []
    const cleaned = rawTags
      .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
      .filter(Boolean)
    const hasImported = cleaned.some(
      (tag) => tag.toLowerCase() === IMPORTED_TAG,
    )
    const tags = hasImported ? cleaned : [...cleaned, IMPORTED_TAG]
    return { ...record, tags }
  })
}

export function parseImportFile(
  file: File | undefined,
  text: string,
  source: ImportSource = "auto",
): { format: ImportFileFormat; records: MyZRecord[] } {
  const format = resolveImportFileFormat(file, text, source)
  if (!format) {
    throw new Error("无法识别导入文件格式")
  }

  if (format === "json") {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new Error("JSON 格式无效")
    }
    return { format, records: normalizeImportedPayload(parsed) }
  }

  if (format === "raindrop") {
    return { format, records: parseRaindropCsv(text) }
  }

  if (format === "weava") {
    return { format, records: parseWeavaCsv(text) }
  }

  return { format, records: parseChromeBookmarksHtml(text) }
}

function resolveImportFileFormat(
  file: File | undefined,
  text: string,
  source: ImportSource,
): ImportFileFormat | null {
  if (source !== "auto") {
    if (source === "myz-json") return "json"
    if (source === "raindrop-csv") return "raindrop"
    if (source === "weava-csv") return "weava"
    return "chrome-bookmarks"
  }

  const name = file?.name?.toLowerCase() || ""
  if (name.endsWith(".json")) return "json"
  if (name.endsWith(".html") || name.endsWith(".htm")) {
    return "chrome-bookmarks"
  }

  const type = file?.type?.toLowerCase() || ""
  if (type.includes("json")) return "json"
  if (type.includes("html")) return "chrome-bookmarks"

  const isCsv = name.endsWith(".csv") || type.includes("csv")
  const trimmed = text.trimStart()

  if (trimmed.startsWith("<!DOCTYPE NETSCAPE-Bookmark-file-1")) {
    return "chrome-bookmarks"
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return "json"
  }

  const headerLine = trimmed.split(/\r?\n/, 1)[0]?.toLowerCase() || ""
  if (isCsv || headerLine.includes("url")) {
    if (
      headerLine.includes("website title") ||
      headerLine.includes("highlighted text")
    ) {
      return "weava"
    }
    if (headerLine.includes("url") && headerLine.includes("created")) {
      return "raindrop"
    }
    if (isCsv) {
      return "raindrop"
    }
  }

  return null
}

function parseCsvRows(text: string): string[][] {
  if (!text) {
    return []
  }

  let normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  if (normalized.charCodeAt(0) === 0xfeff) {
    normalized = normalized.slice(1)
  }

  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]
    if (char === '"') {
      if (inQuotes && normalized[index + 1] === '"') {
        field += '"'
        index += 1
        continue
      }
      inQuotes = !inQuotes
      continue
    }
    if (char === "," && !inQuotes) {
      row.push(field)
      field = ""
      continue
    }
    if (char === "\n" && !inQuotes) {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
      continue
    }
    field += char
  }

  row.push(field)
  rows.push(row)

  while (
    rows.length &&
    rows[rows.length - 1].length === 1 &&
    !rows[rows.length - 1][0].trim()
  ) {
    rows.pop()
  }

  return rows
}

function parseTags(value: string): string[] {
  if (!value) {
    return []
  }
  return value
    .split(/[,#]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag.slice(1) : tag))
}

function normalizeTimestamp(value: string, fallback: string): string {
  if (!value) {
    return fallback
  }
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback
}

function createImportedId(prefix: string) {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function finalizeImportedRecord(
  record: Partial<MyZRecord>,
  prefix: string,
): MyZRecord | null {
  return normalizeRecord({
    schemaVersion: "1.0.0",
    id: record.id || createImportedId(prefix),
    text: "",
    contentType: "text/plain",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...record,
  })
}

function parseRaindropHighlights(value: string): string[] {
  if (!value) {
    return []
  }
  return value
    .split(/\n{2,}|;;+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseRaindropCsv(text: string): MyZRecord[] {
  const rows = parseCsvRows(text)
  if (!rows.length) {
    return []
  }

  const header = rows.shift() || []
  const headerMap = new Map(
    header.map((item, index) => [item.trim().toLowerCase(), index]),
  )

  const urlIndex = headerMap.get("url")
  if (urlIndex === undefined) {
    throw new Error("CSV 缺少 url 列")
  }

  const titleIndex = headerMap.get("title")
  const excerptIndex = headerMap.get("excerpt")
  const noteIndex = headerMap.get("note")
  const tagsIndex = headerMap.get("tags")
  const createdIndex = headerMap.get("created")
  const highlightsIndex = headerMap.get("highlights")

  const nowIso = new Date().toISOString()
  const records: MyZRecord[] = []

  rows.forEach((row) => {
    const url = (row[urlIndex] || "").trim()
    if (!url) {
      return
    }

    const title =
      titleIndex !== undefined ? (row[titleIndex] || "").trim() : ""
    const text =
      excerptIndex !== undefined ? (row[excerptIndex] || "").trim() : ""
    const note = noteIndex !== undefined ? (row[noteIndex] || "").trim() : ""
    const createdRaw =
      createdIndex !== undefined ? (row[createdIndex] || "").trim() : ""
    const createdAt = normalizeTimestamp(createdRaw, nowIso)
    const tagsRaw = tagsIndex !== undefined ? (row[tagsIndex] || "").trim() : ""
    const tags = parseTags(tagsRaw)

    const bookmark = finalizeImportedRecord(
      {
        kind: RECORD_KINDS.BOOKMARK,
        url,
        sourceUrl: url,
        title: title || undefined,
        text,
        html: "",
        note: note || undefined,
        tags: tags.length ? tags : undefined,
        createdAt,
        updatedAt: createdAt,
      },
      "raindrop-bookmark",
    )

    if (bookmark) {
      records.push(bookmark)
    }

    const highlightText =
      highlightsIndex !== undefined ? row[highlightsIndex] || "" : ""
    parseRaindropHighlights(highlightText).forEach((clipText) => {
      const clip = finalizeImportedRecord(
        {
          kind: RECORD_KINDS.CLIP,
          url,
          sourceUrl: url,
          title: title || undefined,
          text: clipText,
          html: "",
          note: note || undefined,
          tags: tags.length ? tags : undefined,
          createdAt,
          updatedAt: createdAt,
        },
        "raindrop-clip",
      )
      if (clip) {
        records.push(clip)
      }
    })
  })

  return records
}

function parseWeavaCsv(text: string): MyZRecord[] {
  const rows = parseCsvRows(text)
  if (!rows.length) {
    return []
  }

  const header = rows.shift() || []
  const headerMap = new Map(
    header.map((item, index) => [item.trim().toLowerCase(), index]),
  )

  const titleIndex = headerMap.get("website title")
  const urlIndex = headerMap.get("website url")
  const textIndex = headerMap.get("highlighted text")
  const noteIndex = headerMap.get("memo")
  const colorIndex = headerMap.get("highlight color")
  const createdIndex = headerMap.get("date created")

  if (urlIndex === undefined || textIndex === undefined) {
    throw new Error("CSV 缺少 Weava 必要列")
  }

  const nowIso = new Date().toISOString()
  const records: MyZRecord[] = []

  rows.forEach((row) => {
    const url = (row[urlIndex] || "").trim()
    const textValue = (row[textIndex] || "").trim()
    if (!url || !textValue) {
      return
    }

    const title =
      titleIndex !== undefined ? (row[titleIndex] || "").trim() : ""
    const note = noteIndex !== undefined ? (row[noteIndex] || "").trim() : ""
    const color =
      colorIndex !== undefined ? (row[colorIndex] || "").trim() : ""
    const createdAt = normalizeTimestamp(
      createdIndex !== undefined ? (row[createdIndex] || "").trim() : "",
      nowIso,
    )

    const record = finalizeImportedRecord(
      {
        kind: RECORD_KINDS.HIGHLIGHT,
        url,
        sourceUrl: url,
        title: title || undefined,
        text: textValue,
        html: "",
        note: note || undefined,
        color: color || undefined,
        createdAt,
        updatedAt: createdAt,
      },
      "weava-highlight",
    )

    if (record) {
      records.push(record)
    }
  })

  return records
}

function parseChromeBookmarksHtml(text: string): MyZRecord[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(text, "text/html")
  const anchors = Array.from(
    doc.querySelectorAll<HTMLAnchorElement>("a[href]"),
  )
  const nowIso = new Date().toISOString()

  return anchors
    .map((anchor, index) =>
      finalizeImportedRecord(
        {
          id: `bookmark-${index}-${anchor.href}`,
          kind: RECORD_KINDS.BOOKMARK,
          url: anchor.href,
          sourceUrl: anchor.href,
          title: anchor.textContent?.trim() || undefined,
          text: anchor.textContent?.trim() || "",
          html: "",
          createdAt: normalizeTimestamp(anchor.getAttribute("add_date") || "", nowIso),
          updatedAt: normalizeTimestamp(anchor.getAttribute("add_date") || "", nowIso),
        },
        "chrome-bookmark",
      ),
    )
    .filter((record): record is MyZRecord => record !== null)
}
