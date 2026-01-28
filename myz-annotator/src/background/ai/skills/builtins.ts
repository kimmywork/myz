import type { SkillFileRecord, SkillMetadata } from "./types.js"
import { buildSkillMetadata, splitSkillMarkdown, validateSkillMetadata } from "./parser.js"
import agilePrinciplesSkill from "@/skills/builtin/agile-principles/SKILL.md?raw"
import analyticalSkill from "@/skills/builtin/analytical-thinking/SKILL.md?raw"
import brainstormingSkill from "@/skills/builtin/brainstorming/SKILL.md?raw"
import criticalSkill from "@/skills/builtin/critical-thinking/SKILL.md?raw"
import designSkill from "@/skills/builtin/design-thinking/SKILL.md?raw"
import dialecticalSkill from "@/skills/builtin/dialectical-thinking/SKILL.md?raw"
import estimatingSkill from "@/skills/builtin/estimating/SKILL.md?raw"
import planningSkill from "@/skills/builtin/planning/SKILL.md?raw"
import problemSolvingSkill from "@/skills/builtin/problem-solving/SKILL.md?raw"
import sequentialSkill from "@/skills/builtin/sequential-thinking/SKILL.md?raw"
import sixHatsSkill from "@/skills/builtin/six-thinking-hats/SKILL.md?raw"
import socraticSkill from "@/skills/builtin/socratic/SKILL.md?raw"
import taskingSkill from "@/skills/builtin/tasking/SKILL.md?raw"
import thinkingToolsSkill from "@/skills/builtin/thinking-tools/SKILL.md?raw"

type BuiltinSkillSeed = {
  id: string
  record: SkillMetadata
  files: SkillFileRecord[]
}

const BUILTIN_SKILL_SOURCES = [
  {
    rootDir: "brainstorming",
    files: [
      {
        path: "SKILL.md",
        content: brainstormingSkill,
        encoding: "utf-8" as const,
      },
    ],
  },
  {
    rootDir: "tasking",
    files: [
      {
        path: "SKILL.md",
        content: taskingSkill,
        encoding: "utf-8" as const,
      },
    ],
  },
  {
    rootDir: "estimating",
    files: [
      {
        path: "SKILL.md",
        content: estimatingSkill,
        encoding: "utf-8" as const,
      },
    ],
  },
  {
    rootDir: "planning",
    files: [
      {
        path: "SKILL.md",
        content: planningSkill,
        encoding: "utf-8" as const,
      },
    ],
  },
  {
    rootDir: "agile-principles",
    files: [
      {
        path: "SKILL.md",
        content: agilePrinciplesSkill,
        encoding: "utf-8" as const,
      },
    ],
  },
  {
    rootDir: "problem-solving",
    files: [
      {
        path: "SKILL.md",
        content: problemSolvingSkill,
        encoding: "utf-8" as const,
      },
    ],
  },
  {
    rootDir: "thinking-tools",
    files: [
      {
        path: "SKILL.md",
        content: thinkingToolsSkill,
        encoding: "utf-8" as const,
      },
    ],
  },
  {
    rootDir: "analytical-thinking",
    files: [
      {
        path: "SKILL.md",
        content: analyticalSkill,
        encoding: "utf-8" as const,
      },
    ],
  },
  {
    rootDir: "critical-thinking",
    files: [
      {
        path: "SKILL.md",
        content: criticalSkill,
        encoding: "utf-8" as const,
      },
    ],
  },
  {
    rootDir: "design-thinking",
    files: [
      {
        path: "SKILL.md",
        content: designSkill,
        encoding: "utf-8" as const,
      },
    ],
  },
  {
    rootDir: "sequential-thinking",
    files: [
      {
        path: "SKILL.md",
        content: sequentialSkill,
        encoding: "utf-8" as const,
      },
    ],
  },
  {
    rootDir: "dialectical-thinking",
    files: [
      {
        path: "SKILL.md",
        content: dialecticalSkill,
        encoding: "utf-8" as const,
      },
    ],
  },
  {
    rootDir: "six-thinking-hats",
    files: [
      {
        path: "SKILL.md",
        content: sixHatsSkill,
        encoding: "utf-8" as const,
      },
    ],
  },
  {
    rootDir: "socratic",
    files: [
      {
        path: "SKILL.md",
        content: socraticSkill,
        encoding: "utf-8" as const,
      },
    ],
  },
]

const BUILTIN_SKILLS: BuiltinSkillSeed[] = BUILTIN_SKILL_SOURCES.flatMap((source) => {
  const skillFile = source.files.find((file) => file.path === "SKILL.md")
  if (!skillFile) {
    console.warn("Builtin skill missing SKILL.md", source.rootDir)
    return []
  }

  const { frontmatter, error } = splitSkillMarkdown(skillFile.content)
  if (error || !frontmatter) {
    console.warn("Builtin skill SKILL.md frontmatter invalid", source.rootDir)
    return []
  }

  const { name, description, errors } = validateSkillMetadata(frontmatter)
  if (errors.length) {
    console.warn("Builtin skill SKILL.md invalid", source.rootDir, errors.join(" "))
    return []
  }

  if (source.rootDir && source.rootDir !== name) {
    console.warn("Builtin skill name mismatch", source.rootDir, name)
    return []
  }

  const now = new Date().toISOString()
  const record = buildSkillMetadata(
    {
      ...frontmatter,
      name,
      description,
    },
    now,
  )
  record.builtin = true
  const files: SkillFileRecord[] = source.files.map((file) => ({
    skillId: name,
    path: file.path,
    content: file.content,
    encoding: file.encoding,
    updatedAt: now,
  }))
  record.fileCount = files.length

  return [
    {
      id: name,
      record,
      files,
    },
  ]
})

const BUILTIN_SKILL_IDS = new Set(BUILTIN_SKILLS.map((skill) => skill.id))

export function isBuiltinSkill(skillId: string) {
  return BUILTIN_SKILL_IDS.has(skillId)
}

export function listBuiltinSkillSeeds() {
  return BUILTIN_SKILLS.slice()
}
