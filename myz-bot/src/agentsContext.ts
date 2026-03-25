import { existsSync, readFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"

const AGENTS_MAX_CHARS = 12_000

function normalizeText(value: string) {
  return value.replace(/\r\n/g, "\n").trim()
}

function trimAgentsContent(value: string) {
  const normalized = normalizeText(value)
  if (!normalized) return ""
  if (normalized.length <= AGENTS_MAX_CHARS) return normalized
  return `${normalized.slice(0, AGENTS_MAX_CHARS - 8).trim()}\n[已截断]`
}

export function findNearestAgentsFile(options: {
  workspaceRoot: string
  targetPath: string
}) {
  let current = resolve(options.targetPath)
  while (true) {
    const candidate = resolve(current, "AGENTS.md")
    if (existsSync(candidate)) return candidate
    if (current === dirname(current)) break
    const next = dirname(current)
    current = next
  }
  return ""
}

export function readWorkspaceAgentsFile(workspaceRoot: string) {
  const path = resolve(workspaceRoot, "AGENTS.md")
  if (!existsSync(path)) {
    return {
      path: "",
      content: "",
      relativePath: "",
    }
  }
  const content = trimAgentsContent(readFileSync(path, "utf-8"))
  return {
    path,
    content,
    relativePath: "AGENTS.md",
  }
}

export function readNearestAgentsForTarget(options: {
  workspaceRoot: string
  targetPath: string
}) {
  const path = findNearestAgentsFile(options)
  if (!path) {
    return {
      path: "",
      content: "",
      relativePath: "",
    }
  }
  return {
    path,
    content: trimAgentsContent(readFileSync(path, "utf-8")),
    relativePath: relative(resolve(options.workspaceRoot), path) || "AGENTS.md",
  }
}

export function formatAgentsNotice(options: {
  relativePath: string
  content: string
}) {
  if (!options.content.trim()) return ""
  return [
    `[AGENTS instructions from ${options.relativePath}]`,
    options.content.trim(),
  ].join("\n")
}
