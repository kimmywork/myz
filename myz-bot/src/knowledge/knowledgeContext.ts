import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { KnowledgeLayer, KnowledgeIndexEntry } from "./types"
import { loadIndex } from "./knowledgeStore"

export interface KnowledgeContextOptions {
  knowledgeDir: string
  maxItems?: number
  layerFilter?: KnowledgeLayer[]
  topicHints?: string[]
}

function scoreEntry(entry: KnowledgeIndexEntry, topicHints: string[]): number {
  let score = entry.confidence * 50
  score += Math.min(entry.accessCount * 2, 20)

  if (topicHints.length > 0) {
    const hintSet = new Set(topicHints.map((h) => h.toLowerCase()))
    for (const tag of entry.tags) {
      if (hintSet.has(tag.toLowerCase())) {
        score += 30
      }
    }
    const titleLower = entry.title.toLowerCase()
    for (const hint of topicHints) {
      if (titleLower.includes(hint.toLowerCase())) {
        score += 20
      }
    }
  }

  if (entry.pinned) {
    score += 40
  }

  const updatedAt = Date.parse(entry.updatedAt)
  if (Number.isFinite(updatedAt)) {
    const ageDays = (Date.now() - updatedAt) / (24 * 60 * 60 * 1000)
    score += Math.max(0, 10 - ageDays * 0.5)
  }

  return score
}

export function renderKnowledgeContext(options: KnowledgeContextOptions): string {
  const { knowledgeDir, maxItems = 8, layerFilter, topicHints = [] } = options
  const index = loadIndex(knowledgeDir)

  if (!index.entries.length) return ""

  let entries = index.entries.filter((e) => !e.archived)

  if (layerFilter?.length) {
    entries = entries.filter((e) => layerFilter.includes(e.layer))
  }

  entries = entries
    .map((entry) => ({ entry, score: scoreEntry(entry, topicHints) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxItems)
    .map(({ entry }) => entry)

  if (!entries.length) return ""

  const lines: string[] = ["## 知识库上下文", ""]

  for (const entry of entries) {
    const filePath = resolve(knowledgeDir, entry.filePath)
    let body = ""
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, "utf-8")
      const match = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/)
      body = match ? match[1].trim().slice(0, 300) : ""
    }

    const layerLabels: Record<KnowledgeLayer, string> = {
      concepts: "概念",
      structure: "结构",
      behavior: "行为",
      ops: "运维",
    }

    lines.push(`### [${layerLabels[entry.layer]}] ${entry.title}`)
    if (entry.tags.length > 0) {
      lines.push(`标签: ${entry.tags.join(", ")}`)
    }
    if (body) {
      lines.push(body)
    }
    lines.push("")
  }

  return lines.join("\n")
}
