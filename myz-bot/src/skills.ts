import { readdirSync, readFileSync, existsSync } from "node:fs"
import { resolve, join } from "node:path"

export interface SkillSource {
  id: string
  dir: string
  readonly?: boolean
}

export interface SkillInfo {
  name: string
  description?: string
  sourceId: string
}

export interface SkillFilterOptions {
  allowlist?: string[]
  denylist?: string[]
  sourceId?: string
}

function extractDescription(content: string) {
  const lines = content.split(/\r?\n/).map((line) => line.trim())
  for (const line of lines) {
    if (!line) continue
    const match = line.match(/^description\s*:\s*(.+)$/i)
    if (match) return match[1].trim()
  }
  for (const line of lines) {
    if (!line) continue
    if (line.startsWith("#")) continue
    return line
  }
  return ""
}

function normalizeSkillKey(value: string) {
  return value.trim().toLowerCase()
}

function isSkillAllowed(
  skill: SkillInfo,
  allowlist: Set<string> | null,
  denylist: Set<string>,
) {
  const keys = [
    normalizeSkillKey(skill.name),
    normalizeSkillKey(`${skill.sourceId}/${skill.name}`),
  ]
  if (keys.some((key) => denylist.has(key))) return false
  if (!allowlist || !allowlist.size) return true
  return keys.some((key) => allowlist.has(key))
}

function toPolicySets(options: SkillFilterOptions = {}) {
  return {
    allowlist:
      options.allowlist && options.allowlist.length
        ? new Set(options.allowlist.map(normalizeSkillKey))
        : null,
    denylist: new Set((options.denylist || []).map(normalizeSkillKey)),
  }
}

function assertSkillAllowed(
  skill: SkillInfo,
  options: SkillFilterOptions = {},
) {
  const { allowlist, denylist } = toPolicySets(options)
  if (!isSkillAllowed(skill, allowlist, denylist)) {
    throw new Error(`Skill not allowed: ${skill.sourceId}/${skill.name}`)
  }
}

export function listSkills(
  sources: SkillSource[],
  options: SkillFilterOptions = {},
): SkillInfo[] {
  const results: SkillInfo[] = []
  const { allowlist, denylist } = toPolicySets(options)
  for (const source of sources) {
    if (options.sourceId && source.id !== options.sourceId) continue
    if (!existsSync(source.dir)) continue
    const entries = readdirSync(source.dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const skillName = entry.name
      const skillFile = resolve(source.dir, skillName, "SKILL.md")
      if (!existsSync(skillFile)) continue
      const content = readFileSync(skillFile, "utf-8")
      const skill = {
        name: skillName,
        description: extractDescription(content),
        sourceId: source.id,
      }
      if (!isSkillAllowed(skill, allowlist, denylist)) continue
      results.push(skill)
    }
  }
  return results
}

function findSkillSources(
  sources: SkillSource[],
  skillName: string,
  filePath: string,
  sourceId?: string,
) {
  const candidates = sourceId
    ? sources.filter((source) => source.id === sourceId)
    : sources
  return candidates.filter((source) =>
    existsSync(resolve(source.dir, skillName, filePath)),
  )
}

export function resolveSkillFile(
  sources: SkillSource[],
  skillName: string,
  filePath = "SKILL.md",
  sourceId?: string,
  options: SkillFilterOptions = {},
) {
  const matches = findSkillSources(sources, skillName, filePath, sourceId)
  if (!matches.length) {
    throw new Error(`Skill file not found: ${skillName}/${filePath}`)
  }
  if (matches.length > 1 && !sourceId) {
    const sourceList = matches.map((item) => item.id).join(", ")
    throw new Error(
      `Skill name is ambiguous: ${skillName}. Available sources: ${sourceList}`,
    )
  }
  assertSkillAllowed(
    {
      name: skillName,
      sourceId: matches[0].id,
    },
    options,
  )
  return resolve(matches[0].dir, skillName, filePath)
}

export function readSkillFile(
  sources: SkillSource[],
  skillName: string,
  filePath = "SKILL.md",
  sourceId?: string,
  options: SkillFilterOptions = {},
) {
  const absolute = resolveSkillFile(
    sources,
    skillName,
    filePath,
    sourceId,
    options,
  )
  return readFileSync(absolute, "utf-8")
}

export type SkillPathInfo =
  | { kind: "root" }
  | { kind: "source"; sourceId: string }
  | { kind: "skill"; skillName: string; filePath?: string; sourceId?: string }

export function parseSkillsPath(
  rawPath: string,
  sourceIds: string[],
): SkillPathInfo | null {
  const normalized = rawPath.replace(/^\/+/, "")
  if (!normalized.startsWith("skills")) return null
  const rest = normalized.slice("skills".length).replace(/^\/+/, "")
  if (!rest) {
    return { kind: "root" }
  }
  const parts = rest.split("/").filter(Boolean)
  if (!parts.length) return { kind: "root" }
  const [first, second, ...fileParts] = parts
  if (sourceIds.includes(first)) {
    if (!second) return { kind: "source", sourceId: first }
    const filePath = fileParts.length ? join(...fileParts) : undefined
    return { kind: "skill", sourceId: first, skillName: second, filePath }
  }
  const filePath = parts.length > 1 ? join(...parts.slice(1)) : undefined
  return { kind: "skill", skillName: first, filePath }
}
