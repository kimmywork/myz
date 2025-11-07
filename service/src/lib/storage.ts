import { mkdir, readFile, writeFile, rm, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { env } from "@/lib/env";

const SNAPSHOT_FILENAME = "latest.json";

export async function saveSnapshot<T>(userId: string, payload: T): Promise<void> {
  const directory = getUserDirectory(userId);
  await mkdir(directory, { recursive: true });

  const filePath = join(directory, SNAPSHOT_FILENAME);
  await writeJson(filePath, payload);
}

export async function readSnapshot<T>(userId: string): Promise<T | null> {
  const directory = getUserDirectory(userId);
  const filePath = join(directory, SNAPSHOT_FILENAME);

  try {
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch (error: unknown) {
    if (isNotFound(error)) {
      return null;
    }

    throw error;
  }
}

export async function appendChangeSet(
  userId: string,
  version: number,
  changes: unknown
): Promise<void> {
  const directory = join(getUserDirectory(userId), "versions");
  await mkdir(directory, { recursive: true });

  const filePath = join(directory, `${version}.json`);
  await writeJson(filePath, changes);
}

export async function readChangeSets(
  userId: string,
  fromVersionExclusive: number
): Promise<Array<{ version: number; payload: unknown }>> {
  const directory = join(getUserDirectory(userId), "versions");

  try {
    const files = await readdir(directory);
    const relevantFiles = files
      .map((file) => ({ file, version: Number(file.replace(/\.json$/, "")) }))
      .filter((entry) => Number.isFinite(entry.version))
      .filter((entry) => entry.version > fromVersionExclusive)
      .sort((a, b) => a.version - b.version);

    const result: Array<{ version: number; payload: unknown }> = [];

    for (const entry of relevantFiles) {
      const content = await readFile(join(directory, entry.file), "utf-8");
      result.push({ version: entry.version, payload: JSON.parse(content) });
    }

    return result;
  } catch (error: unknown) {
    if (isNotFound(error)) {
      return [];
    }

    throw error;
  }
}

export async function clearUserStorage(userId: string): Promise<void> {
  const directory = getUserDirectory(userId);

  try {
    await rm(directory, { recursive: true, force: true });
  } catch (error: unknown) {
    if (!isNotFound(error)) {
      throw error;
    }
  }
}

export async function storageSize(userId: string): Promise<number> {
  const directory = getUserDirectory(userId);

  try {
    const files = await readdir(directory, { withFileTypes: true });
    let total = 0;

    for (const file of files) {
      const path = join(directory, file.name);
      if (file.isDirectory()) {
        total += await directorySize(path);
      } else {
        const fileStats = await stat(path);
        total += fileStats.size;
      }
    }

    return total;
  } catch (error: unknown) {
    if (isNotFound(error)) {
      return 0;
    }

    throw error;
  }
}

function getUserDirectory(userId: string): string {
  return join(env.STORAGE_ROOT, userId);
}

async function directorySize(path: string): Promise<number> {
  const files = await readdir(path, { withFileTypes: true });
  let total = 0;

  for (const file of files) {
    const currentPath = join(path, file.name);
    if (file.isDirectory()) {
      total += await directorySize(currentPath);
    } else {
      const fileStats = await stat(currentPath);
      total += fileStats.size;
    }
  }

  return total;
}

async function writeJson(path: string, payload: unknown): Promise<void> {
  const content = JSON.stringify(payload, null, 2);
  await writeFile(path, content, "utf-8");
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code: string }).code === "ENOENT");
}
