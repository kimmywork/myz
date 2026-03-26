import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs"
import { resolve } from "node:path"
import { ensureSoulGrowthRuntime } from "./growth"

export const DEFAULT_SOUL = `# Bot 人设模板（可编辑）

## 名字与身份
请写明你的名字、身份与自我称呼方式（如“我叫 XX”）。

## 外观设定
描述外观特征、风格偏好（可选）。

## 性格与气质
描述性格、价值取向、行事风格、情绪倾向等。

## 语气与表达
说明你偏好的语气、措辞习惯、叙述方式。

## 喜好与禁忌
说明你愿意强调或避免的内容与表达风格。

## 示例（可选）
给出一段简短的自我介绍或对话示例。
`

const SOUL_MAX_CHARS = 6000
const VOLATILE_SOUL_SECTION_HEADINGS = new Set([
  "## 角色成长状态",
  "## 最近反馈摘要",
])

let soulMutationQueue: Promise<unknown> = Promise.resolve()

function normalizeSoulMarkdown(value: string) {
  return value.replace(/\r\n/g, "\n").trim()
}

export function stripVolatileSoulSections(content: string) {
  const normalized = normalizeSoulMarkdown(content)
  if (!normalized) return normalized

  const lines = normalized.split("\n")
  const kept: string[] = []
  let skipping = false

  lines.forEach((line) => {
    const trimmed = line.trim()
    if (/^##\s+/.test(trimmed)) {
      skipping = VOLATILE_SOUL_SECTION_HEADINGS.has(trimmed)
      if (skipping) return
    }
    if (!skipping) {
      kept.push(line)
    }
  })

  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function compactSoulContent(
  content: string,
  maxChars = SOUL_MAX_CHARS,
) {
  const normalized = normalizeSoulMarkdown(content)
  if (!normalized) return DEFAULT_SOUL.trim()
  if (normalized.length <= maxChars) return normalized

  const lines = normalized.split("\n")
  const sections: Array<{ heading: string; body: string[] }> = []
  let intro: string[] = []
  let current: { heading: string; body: string[] } | null = null

  lines.forEach((line) => {
    if (/^#{1,3}\s+/.test(line)) {
      current = { heading: line.trim(), body: [] }
      sections.push(current)
      return
    }
    if (current) {
      current.body.push(line)
      return
    }
    intro.push(line)
  })

  const headingChars = sections.reduce((sum, section) => sum + section.heading.length + 2, 0)
  const introText = intro.join("\n").trim()
  const availableChars = Math.max(
    400,
    maxChars - headingChars - introText.length - 64,
  )
  const bodyLimit = Math.max(160, Math.floor(availableChars / Math.max(1, sections.length || 1)))
  const compacted = [
    introText,
    ...sections.map((section) => {
      const body = section.body.join("\n").trim()
      if (!body) return section.heading
      if (body.length <= bodyLimit) {
        return `${section.heading}\n${body}`
      }
      return `${section.heading}\n${body.slice(0, Math.max(80, bodyLimit - 12)).trim()}\n[已收敛]`
    }),
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim()

  if (compacted.length <= maxChars) return compacted
  return `${compacted.slice(0, maxChars - 12).trim()}\n[已收敛]`
}

function readRawSoul(workspaceRoot: string) {
  const path = ensureSoulFile(workspaceRoot)
  return readFileSync(path, "utf-8")
}

export function ensureSoulFile(workspaceRoot: string, runtimeRoot?: string) {
  const path = resolve(workspaceRoot, "SOUL.md")
  if (!existsSync(path)) {
    writeFileSync(path, DEFAULT_SOUL)
  }
  if (runtimeRoot) {
    ensureSoulRuntime(runtimeRoot)
    ensureSoulGrowthRuntime(runtimeRoot)
  }
  return path
}

export async function runExclusiveSoulMutation<T>(
  action: () => Promise<T>,
): Promise<T> {
  const previous = soulMutationQueue.catch(() => undefined)
  const next = previous.then(action, action)
  soulMutationQueue = next.catch(() => undefined)
  return next
}

export function loadSoul(workspaceRoot: string) {
  return compactSoulContent(stripVolatileSoulSections(readRawSoul(workspaceRoot)))
}

export interface SoulDraftRecord {
  id: string
  path: string
  createdAt: string
}

function getSoulPaths(runtimeRoot: string) {
  return {
    stateDir: resolve(runtimeRoot, "soul"),
    draftsDir: resolve(runtimeRoot, "soul", "drafts"),
    versionsDir: resolve(runtimeRoot, "soul", "versions"),
    auditFile: resolve(runtimeRoot, "soul", "audit.jsonl"),
  }
}

export function ensureSoulRuntime(runtimeRoot: string) {
  const paths = getSoulPaths(runtimeRoot)
  mkdirSync(paths.draftsDir, { recursive: true })
  mkdirSync(paths.versionsDir, { recursive: true })
  if (!existsSync(paths.auditFile)) {
    writeFileSync(paths.auditFile, "")
  }
  return paths
}

function appendSoulAudit(
  runtimeRoot: string,
  payload: Record<string, unknown>,
) {
  const paths = ensureSoulRuntime(runtimeRoot)
  appendFileSync(
    paths.auditFile,
    JSON.stringify({ timestamp: new Date().toISOString(), ...payload }) + "\n",
  )
}

export function createSoulDraft(options: {
  runtimeRoot: string
  content: string
  metadata: {
    actor: string
    trigger: "manual" | "auto"
    conversationId?: string
  }
}): SoulDraftRecord {
  const paths = ensureSoulRuntime(options.runtimeRoot)
  const id = `draft-${Date.now()}`
  const path = resolve(paths.draftsDir, `${id}.md`)
  const normalizedContent =
    options.metadata.trigger === "auto"
      ? stripVolatileSoulSections(options.content)
      : options.content
  writeFileSync(path, `${compactSoulContent(normalizedContent)}\n`)
  appendSoulAudit(options.runtimeRoot, {
    type: "draft_created",
    draftId: id,
    actor: options.metadata.actor,
    trigger: options.metadata.trigger,
    conversationId: options.metadata.conversationId,
  })
  return {
    id,
    path,
    createdAt: new Date().toISOString(),
  }
}

export function listSoulDrafts(runtimeRoot: string): SoulDraftRecord[] {
  const paths = ensureSoulRuntime(runtimeRoot)
  return readdirSync(paths.draftsDir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .reverse()
    .map((name) => ({
      id: name.replace(/\.md$/, ""),
      path: resolve(paths.draftsDir, name),
      createdAt: name.replace(/^draft-/, "").replace(/\.md$/, ""),
    }))
}

export function readSoulDraft(runtimeRoot: string, draftId: string) {
  const paths = ensureSoulRuntime(runtimeRoot)
  const path = resolve(paths.draftsDir, `${draftId}.md`)
  if (!existsSync(path)) {
    throw new Error(`SOUL draft not found: ${draftId}`)
  }
  return readFileSync(path, "utf-8")
}

export function applySoulDraft(options: {
  workspaceRoot: string
  runtimeRoot: string
  draftId: string
  metadata: { actor: string }
}) {
  const paths = ensureSoulRuntime(options.runtimeRoot)
  const draftPath = resolve(paths.draftsDir, `${options.draftId}.md`)
  if (!existsSync(draftPath)) {
    throw new Error(`SOUL draft not found: ${options.draftId}`)
  }
  const currentSoul = readRawSoul(options.workspaceRoot)
  const nextSoul = compactSoulContent(readFileSync(draftPath, "utf-8"))
  const versionPath = resolve(
    paths.versionsDir,
    `${new Date().toISOString().replace(/[:.]/g, "-")}-${options.draftId}.md`,
  )
  writeFileSync(versionPath, currentSoul)
  const soulPath = resolve(options.workspaceRoot, "SOUL.md")
  writeFileSync(soulPath, nextSoul)
  appendSoulAudit(options.runtimeRoot, {
    type: "draft_applied",
    draftId: options.draftId,
    actor: options.metadata.actor,
    versionPath,
  })
  return { versionPath, soulPath }
}
