import { describe, it, expect } from 'vitest';
import { renderMarkdown, hasMarkdown } from '../../../src/shared/markdownRenderer';

describe('markdownRenderer', () => {
  describe('renderMarkdown', () => {
    it('should return empty string for empty input', () => {
      expect(renderMarkdown('')).toBe('');
    });

    it('should render markdown to HTML', () => {
      const markdown = '**bold**';
      expect(renderMarkdown(markdown)).toContain('<strong>bold</strong>');
    });

    it('should add target="_blank" and rel="noopener noreferrer" to links', () => {
      const markdown = '[link](https://example.com)';
      const html = renderMarkdown(markdown);
      expect(html).toContain('target="_blank"');
      expect(html).toContain('rel="noopener noreferrer"');
      expect(html).toContain('href="https://example.com"');
    });
  });

  describe('hasMarkdown', () => {
    it('should return false for empty input', () => {
      expect(hasMarkdown('')).toBe(false);
    });

    it('should return true for markdown syntax', () => {
      expect(hasMarkdown('**bold**')).toBe(true);
      expect(hasMarkdown('# Header')).toBe(true);
      expect(hasMarkdown('[link](url)')).toBe(true);
    });

    it('should return false for plain text', () => {
      expect(hasMarkdown('plain text')).toBe(false);
    });
  });
});
