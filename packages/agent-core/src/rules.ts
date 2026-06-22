import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { AgentConfig } from "./types"

export interface RuleSegment {
  id: string
  content: string
  source: "global" | "project" | "skill"
  priority: number
}

function loadMarkdownFile(path: string): string {
  if (!existsSync(path)) return ""
  try {
    return readFileSync(path, "utf-8").trim()
  } catch {
    return ""
  }
}

export function loadRules(config: AgentConfig): RuleSegment[] {
  const segments: RuleSegment[] = []

  // Global rules: ~/.myz/rules.md
  const globalRules = loadMarkdownFile(resolve(config.runtimeRoot, "rules.md"))
  if (globalRules) {
    segments.push({
      id: "global",
      content: globalRules,
      source: "global",
      priority: 0,
    })
  }

  // Project rules: <workspace>/AGENTS.md
  const projectRules = loadMarkdownFile(resolve(config.workspaceRoot, "AGENTS.md"))
  if (projectRules) {
    segments.push({
      id: "project",
      content: projectRules,
      source: "project",
      priority: 10,
    })
  }

  // Skill rules: <workspace>/.agents/skills/*/rules.md
  const skillsDir = resolve(config.workspaceRoot, ".agents", "skills")
  if (existsSync(skillsDir)) {
    try {
      const { readdirSync } = require("node:fs")
      const entries = readdirSync(skillsDir, { withFileTypes: true })
      let priority = 20
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const rulesPath = resolve(skillsDir, entry.name, "rules.md")
        const content = loadMarkdownFile(rulesPath)
        if (content) {
          segments.push({
            id: `skill:${entry.name}`,
            content,
            source: "skill",
            priority: priority++,
          })
        }
      }
    } catch {}
  }

  return segments.sort((a, b) => a.priority - b.priority)
}

export function buildRulesPrompt(segments: RuleSegment[]): string {
  if (!segments.length) return ""
  return segments.map((s) => `[${s.source}] ${s.content}`).join("\n\n")
}
