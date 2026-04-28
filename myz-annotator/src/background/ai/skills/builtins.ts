import {
  buildSkillMetadata,
  splitSkillMarkdown,
  validateSkillMetadata,
} from "./parser.js";
import type { SkillFileRecord, SkillMetadata } from "./types.js";
import browserOperationsSkill from "@/skills/builtin/browser-operations/SKILL.md?raw";
import planningModeSkill from "@/skills/builtin/planning-mode/SKILL.md?raw";

type BuiltinSkillSeed = {
  id: string;
  record: SkillMetadata;
  files: SkillFileRecord[];
};

const BUILTIN_SKILL_SOURCES = [
  {
    rootDir: "browser-operations",
    files: [
      {
        path: "SKILL.md",
        content: browserOperationsSkill,
        encoding: "utf-8" as const,
      },
    ],
  },
  {
    rootDir: "planning-mode",
    files: [
      {
        path: "SKILL.md",
        content: planningModeSkill,
        encoding: "utf-8" as const,
      },
    ],
  },
];

const BUILTIN_SKILLS: BuiltinSkillSeed[] = BUILTIN_SKILL_SOURCES.flatMap(
  (source) => {
    const skillFile = source.files.find((file) => file.path === "SKILL.md");
    if (!skillFile) {
      console.warn("Builtin skill missing SKILL.md", source.rootDir);
      return [];
    }

    const { frontmatter, error } = splitSkillMarkdown(skillFile.content);
    if (error || !frontmatter) {
      console.warn(
        "Builtin skill SKILL.md frontmatter invalid",
        source.rootDir,
      );
      return [];
    }

    const { name, description, errors } = validateSkillMetadata(frontmatter);
    if (errors.length) {
      console.warn(
        "Builtin skill SKILL.md invalid",
        source.rootDir,
        errors.join(" "),
      );
      return [];
    }

    if (source.rootDir && source.rootDir !== name) {
      console.warn("Builtin skill name mismatch", source.rootDir, name);
      return [];
    }

    const now = new Date().toISOString();
    const record = buildSkillMetadata(
      {
        ...frontmatter,
        name,
        description,
      },
      now,
    );
    record.builtin = true;
    const files: SkillFileRecord[] = source.files.map((file) => ({
      skillId: name,
      path: file.path,
      content: file.content,
      encoding: file.encoding,
      updatedAt: now,
    }));
    record.fileCount = files.length;

    return [
      {
        id: name,
        record,
        files,
      },
    ];
  },
);

const BUILTIN_SKILL_IDS = new Set(BUILTIN_SKILLS.map((skill) => skill.id));

export function isBuiltinSkill(skillId: string) {
  return BUILTIN_SKILL_IDS.has(skillId);
}

export function listBuiltinSkillSeeds() {
  return BUILTIN_SKILLS.slice();
}
