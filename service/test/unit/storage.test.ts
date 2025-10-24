import { ensureStorageDirectory, saveHighlight, loadHighlight, deleteHighlight, loadAllHighlights } from '../../src/utils/storage';
import fs from 'fs/promises';
import path from 'path';

const TEST_STORAGE_PATH = '/tmp/test-storage';
const TEST_USER_ID = 'test-user-123';

// Mock the storage path
jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

beforeAll(async () => {
  process.env.DATA_STORAGE_PATH = TEST_STORAGE_PATH;
});

afterAll(async () => {
  // Clean up test storage
  try {
    await fs.rm(TEST_STORAGE_PATH, { recursive: true, force: true });
  } catch (error) {
    // Ignore errors
  }
});

beforeEach(async () => {
  // Clean up before each test
  try {
    await fs.rm(TEST_STORAGE_PATH, { recursive: true, force: true });
  } catch (error) {
    // Ignore errors
  }
});

describe('Storage Utilities', () => {
  describe('ensureStorageDirectory', () => {
    it('should create user directory if it does not exist', async () => {
      const userDir = await ensureStorageDirectory(TEST_USER_ID);
      
      expect(userDir).toBe(path.join(TEST_STORAGE_PATH, TEST_USER_ID));
      
      // Verify directory was created
      const stats = await fs.stat(userDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should not fail if directory already exists', async () => {
      await ensureStorageDirectory(TEST_USER_ID);
      await expect(ensureStorageDirectory(TEST_USER_ID)).resolves.toBeDefined();
    });
  });

  describe('saveHighlight', () => {
    it('should save highlight data to file', async () => {
      const highlightId = 'highlight-123';
      const data = {
        id: highlightId,
        text: 'Test highlight',
        url: 'https://example.com',
        createdAt: new Date().toISOString(),
      };

      const filePath = await saveHighlight(TEST_USER_ID, highlightId, data);
      
      expect(filePath).toContain(highlightId);
      
      // Verify file was created
      const content = await fs.readFile(filePath, 'utf-8');
      const saved = JSON.parse(content);
      expect(saved.id).toBe(highlightId);
      expect(saved.text).toBe(data.text);
    });
  });

  describe('loadHighlight', () => {
    it('should load highlight data from file', async () => {
      const highlightId = 'highlight-456';
      const data = {
        id: highlightId,
        text: 'Another highlight',
        url: 'https://example.com/page',
      };

      await saveHighlight(TEST_USER_ID, highlightId, data);
      const loaded = await loadHighlight(TEST_USER_ID, highlightId);

      expect(loaded).toBeDefined();
      expect(loaded.id).toBe(highlightId);
      expect(loaded.text).toBe(data.text);
    });

    it('should return null for non-existent highlight', async () => {
      const loaded = await loadHighlight(TEST_USER_ID, 'non-existent');
      expect(loaded).toBeNull();
    });
  });

  describe('deleteHighlight', () => {
    it('should delete highlight file', async () => {
      const highlightId = 'highlight-789';
      const data = { id: highlightId, text: 'To be deleted' };

      await saveHighlight(TEST_USER_ID, highlightId, data);
      const deleted = await deleteHighlight(TEST_USER_ID, highlightId);

      expect(deleted).toBe(true);
      
      // Verify file was deleted
      const loaded = await loadHighlight(TEST_USER_ID, highlightId);
      expect(loaded).toBeNull();
    });

    it('should return false for non-existent highlight', async () => {
      const deleted = await deleteHighlight(TEST_USER_ID, 'non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('loadAllHighlights', () => {
    it('should load all highlights for a user', async () => {
      const highlights = [
        { id: 'h1', text: 'First' },
        { id: 'h2', text: 'Second' },
        { id: 'h3', text: 'Third' },
      ];

      for (const highlight of highlights) {
        await saveHighlight(TEST_USER_ID, highlight.id, highlight);
      }

      const loaded = await loadAllHighlights(TEST_USER_ID);

      expect(Object.keys(loaded)).toHaveLength(3);
      expect(loaded.h1.text).toBe('First');
      expect(loaded.h2.text).toBe('Second');
      expect(loaded.h3.text).toBe('Third');
    });

    it('should return empty object for user with no highlights', async () => {
      const loaded = await loadAllHighlights('no-highlights-user');
      expect(loaded).toEqual({});
    });
  });
});
