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

export function listSkills(sources: SkillSource[]): SkillInfo[] {
  const results: SkillInfo[] = []
  for (const source of sources) {
    if (!existsSync(source.dir)) continue
    const entries = readdirSync(source.dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const skillName = entry.name
      const skillFile = resolve(source.dir, skillName, "SKILL.md")
      if (!existsSync(skillFile)) continue
      const content = readFileSync(skillFile, "utf-8")
      results.push({
        name: skillName,
        description: extractDescription(content),
        sourceId: source.id,
      })
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
  return resolve(matches[0].dir, skillName, filePath)
}

export function readSkillFile(
  sources: SkillSource[],
  skillName: string,
  filePath = "SKILL.md",
  sourceId?: string,
) {
  const absolute = resolveSkillFile(sources, skillName, filePath, sourceId)
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
