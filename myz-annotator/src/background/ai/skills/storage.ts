import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { isBuiltinSkill, listBuiltinSkillSeeds } from "./builtins.js";
import {
  buildSkillInstruction,
  buildSkillMetadata,
  splitSkillMarkdown,
  validateSkillMetadata,
} from "./parser.js";
import type {
  SkillFileRecord,
  SkillImportPayload,
  SkillInstruction,
  SkillMetadata,
} from "./types.js";

interface SkillsDB extends DBSchema {
  skills: {
    key: string;
    value: SkillMetadata;
  };
  skill_files: {
    key: string;
    value: SkillFileRecord & { key: string };
    indexes: { "by-skillId": string };
  };
}

const DB_NAME = "MyZAgentSkillsDB";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<SkillsDB>> | null = null;
let builtinSeedPromise: Promise<void> | null = null;

function getDb(): Promise<IDBPDatabase<SkillsDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SkillsDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("skills")) {
          db.createObjectStore("skills", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("skill_files")) {
          const store = db.createObjectStore("skill_files", {
            keyPath: "key",
          });
          store.createIndex("by-skillId", "skillId");
        }
      },
    });
  }
  return dbPromise;
}

function buildFileKey(skillId: string, path: string) {
  return `${skillId}::${path}`;
}

function normalizePath(path: string) {
  const raw = typeof path === "string" ? path.trim() : "";
  return raw.replace(/^[./]+/, "");
}

async function ensureBuiltinSkills() {
  if (builtinSeedPromise) return builtinSeedPromise;

  const seeds = listBuiltinSkillSeeds();
  if (!seeds.length) {
    builtinSeedPromise = Promise.resolve();
    return builtinSeedPromise;
  }

  builtinSeedPromise = (async () => {
    const db = await getDb();

    // Seed missing builtin skills
    for (const seed of seeds) {
      const existing = await db.get("skills", seed.id);
      if (existing) continue;

      const tx = db.transaction(["skills", "skill_files"], "readwrite");
      await tx.objectStore("skills").put(seed.record);
      for (const file of seed.files) {
        await tx.objectStore("skill_files").put({
          key: buildFileKey(seed.id, file.path),
          ...file,
        });
      }
      await tx.done;
    }

    // Cleanup stale builtin skills (ones that no longer exist in code)
    const allSkills = await db.getAll("skills");
    const tx = db.transaction(["skills", "skill_files"], "readwrite");
    for (const skill of allSkills) {
      if (skill.builtin && !isBuiltinSkill(skill.id)) {
        await tx.objectStore("skills").delete(skill.id);
        const files = await tx
          .objectStore("skill_files")
          .index("by-skillId")
          .getAll(skill.id);
        for (const file of files) {
          await tx.objectStore("skill_files").delete(file.key);
        }
      }
    }
    await tx.done;
  })();

  return builtinSeedPromise;
}

export async function listSkills(): Promise<SkillMetadata[]> {
  await ensureBuiltinSkills();
  const db = await getDb();
  const skills = await db.getAll("skills");
  return skills
    .map((s) => (isBuiltinSkill(s.id) ? { ...s, builtin: true } : s))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listSkillFiles(
  skillId: string,
): Promise<SkillFileRecord[]> {
  await ensureBuiltinSkills();
  const db = await getDb();
  const files = await db.getAllFromIndex("skill_files", "by-skillId", skillId);
  return files
    .map(({ key: _, ...rest }) => rest)
    .sort((a, b) => a.path.localeCompare(b.path));
}

export async function getSkillFile(
  skillId: string,
  path: string,
): Promise<SkillFileRecord | null> {
  await ensureBuiltinSkills();
  const db = await getDb();
  const normalizedPath = normalizePath(path);
  const file = await db.get(
    "skill_files",
    buildFileKey(skillId, normalizedPath),
  );
  if (!file) return null;
  const { key: _, ...rest } = file;
  return rest;
}

async function getSkillRecord(skillId: string): Promise<SkillMetadata | null> {
  await ensureBuiltinSkills();
  const db = await getDb();
  const record = await db.get("skills", skillId);
  if (!record) return null;
  return isBuiltinSkill(record.id) ? { ...record, builtin: true } : record;
}

export async function importSkill(
  payload: SkillImportPayload,
): Promise<{ skill: SkillMetadata }> {
  const files = Array.isArray(payload.files) ? payload.files : [];
  const normalizedFiles = files
    .map((file) => ({
      path: normalizePath(file.path),
      content: file.content,
      encoding: file.encoding,
    }))
    .filter((file) => file.path);

  const skillFile = normalizedFiles.find((file) => file.path === "SKILL.md");
  if (!skillFile || skillFile.encoding !== "utf-8") {
    throw new Error("缺少可读取的 SKILL.md");
  }

  const { frontmatter, error } = splitSkillMarkdown(skillFile.content);
  if (error || !frontmatter) {
    throw new Error("无法解析 SKILL.md 的 YAML frontmatter");
  }

  const { name, description, errors } = validateSkillMetadata(frontmatter);
  if (errors.length) {
    throw new Error(errors.join(" "));
  }

  if (
    payload.rootDir &&
    payload.rootDir.trim() &&
    payload.rootDir.trim() !== name
  ) {
    throw new Error(
      `SKILL.md name (${name}) 必须与目录名 (${payload.rootDir}) 一致`,
    );
  }

  const now = new Date().toISOString();
  const existing = await getSkillRecord(name);
  const record = buildSkillMetadata(
    { ...frontmatter, name, description },
    now,
    existing,
  );

  const fileRecords: SkillFileRecord[] = normalizedFiles.map((file) => ({
    skillId: name,
    path: file.path,
    content: file.content,
    encoding: file.encoding,
    updatedAt: now,
  }));
  record.fileCount = fileRecords.length;

  const db = await getDb();
  const tx = db.transaction(["skills", "skill_files"], "readwrite");
  await tx.objectStore("skills").put(record);
  // Delete old files first
  const oldFiles = await tx
    .objectStore("skill_files")
    .index("by-skillId")
    .getAll(name);
  for (const f of oldFiles) {
    await tx.objectStore("skill_files").delete(f.key);
  }
  // Insert new files
  for (const file of fileRecords) {
    await tx.objectStore("skill_files").put({
      key: buildFileKey(name, file.path),
      ...file,
    });
  }
  await tx.done;

  return { skill: record };
}

export async function updateSkillEnabled(skillId: string, enabled: boolean) {
  const existing = await getSkillRecord(skillId);
  if (!existing) {
    throw new Error("Skill not found");
  }
  const next = {
    ...existing,
    enabled: Boolean(enabled),
    updatedAt: new Date().toISOString(),
  };
  const db = await getDb();
  await db.put("skills", next);
  return next;
}

export async function deleteSkill(skillId: string) {
  if (isBuiltinSkill(skillId)) {
    throw new Error("内置 Skill 不允许删除");
  }
  const db = await getDb();
  const tx = db.transaction(["skills", "skill_files"], "readwrite");
  await tx.objectStore("skills").delete(skillId);
  const files = await tx
    .objectStore("skill_files")
    .index("by-skillId")
    .getAll(skillId);
  for (const file of files) {
    await tx.objectStore("skill_files").delete(file.key);
  }
  await tx.done;
}

export async function updateSkillFile(
  skillId: string,
  path: string,
  content: string,
  encoding: "utf-8" | "base64",
) {
  const normalizedPath = normalizePath(path);
  if (!normalizedPath) {
    throw new Error("文件路径不能为空");
  }
  const existing = await getSkillRecord(skillId);
  if (!existing) {
    throw new Error("Skill not found");
  }
  const now = new Date().toISOString();
  let recordToUpdate = existing;

  if (normalizedPath === "SKILL.md" && encoding === "utf-8") {
    const { frontmatter, error } = splitSkillMarkdown(content);
    if (error || !frontmatter) {
      throw new Error("无法解析 SKILL.md 的 YAML frontmatter");
    }
    const { name, description, errors } = validateSkillMetadata(frontmatter);
    if (errors.length) {
      throw new Error(errors.join(" "));
    }
    if (name !== skillId) {
      throw new Error("SKILL.md name 不允许修改");
    }
    const nextRecord = buildSkillMetadata(
      { ...frontmatter, name, description },
      now,
      existing,
    );
    nextRecord.enabled = existing.enabled;
    nextRecord.createdAt = existing.createdAt;
    nextRecord.fileCount = existing.fileCount;
    recordToUpdate = nextRecord;
  }

  const db = await getDb();
  await db.put("skill_files", {
    key: buildFileKey(skillId, normalizedPath),
    skillId,
    path: normalizedPath,
    content,
    encoding,
    updatedAt: now,
  });

  const files = await listSkillFiles(skillId);
  const shouldUpdateCount = files.length !== recordToUpdate.fileCount;
  if (shouldUpdateCount || recordToUpdate.updatedAt !== now) {
    await db.put("skills", {
      ...recordToUpdate,
      fileCount: files.length,
      updatedAt: now,
    });
  }
}

export async function getSkillInstruction(
  skillId: string,
): Promise<SkillInstruction | null> {
  const record = await getSkillRecord(skillId);
  if (!record) return null;
  const skillFile = await getSkillFile(skillId, "SKILL.md");
  if (!skillFile || skillFile.encoding !== "utf-8") {
    return null;
  }
  const { frontmatter, body } = splitSkillMarkdown(skillFile.content);
  const description =
    typeof frontmatter?.description === "string"
      ? frontmatter.description.trim()
      : record.description;
  return buildSkillInstruction({ ...record, description }, body || "");
}
