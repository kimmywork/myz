import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const STORAGE_PATH = process.env.DATA_STORAGE_PATH || './data/highlights';

export async function ensureStorageDirectory(userId: string): Promise<string> {
  const userDir = path.join(STORAGE_PATH, userId);
  await fs.mkdir(userDir, { recursive: true });
  return userDir;
}

export async function saveHighlight(userId: string, highlightId: string, data: any): Promise<string> {
  const userDir = await ensureStorageDirectory(userId);
  const filePath = path.join(userDir, `${highlightId}.json`);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return filePath;
}

export async function loadHighlight(userId: string, highlightId: string): Promise<any | null> {
  try {
    const filePath = path.join(STORAGE_PATH, userId, `${highlightId}.json`);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    return null;
  }
}

export async function deleteHighlight(userId: string, highlightId: string): Promise<boolean> {
  try {
    const filePath = path.join(STORAGE_PATH, userId, `${highlightId}.json`);
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

export async function loadAllHighlights(userId: string): Promise<Record<string, any>> {
  try {
    const userDir = path.join(STORAGE_PATH, userId);
    const files = await fs.readdir(userDir);
    const highlights: Record<string, any> = {};

    for (const file of files) {
      if (file.endsWith('.json')) {
        const highlightId = file.replace('.json', '');
        const content = await fs.readFile(path.join(userDir, file), 'utf-8');
        highlights[highlightId] = JSON.parse(content);
      }
    }

    return highlights;
  } catch (error) {
    return {};
  }
}
