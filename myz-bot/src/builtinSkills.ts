import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { SkillSource } from "./skills"

declare const __MYZ_BOT_BUILTIN_SKILLS__:
  | Record<string, Record<string, string>>
  | undefined

function loadBuiltinSkillFiles() {
  if (typeof __MYZ_BOT_BUILTIN_SKILLS__ !== "undefined") {
    return __MYZ_BOT_BUILTIN_SKILLS__
  }

  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
  const planningModePath = resolve(
    rootDir,
    "myz-annotator",
    "src",
    "skills",
    "builtin",
    "planning-mode",
    "SKILL.md",
  )

  return {
    "planning-mode": {
      "SKILL.md": readFileSync(planningModePath, "utf-8"),
    },
  }
}

export function getBuiltinSkillSource(): SkillSource {
  return {
    id: "builtin",
    kind: "inline",
    readonly: true,
    skills: loadBuiltinSkillFiles(),
  }
}
