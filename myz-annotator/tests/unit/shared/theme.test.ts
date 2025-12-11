import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useThemePreference } from '../../../src/shared/theme';

describe('theme', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('should initialize with default theme', () => {
    const { theme, isDark } = useThemePreference();
    expect(theme.value).toBe('dark');
    expect(isDark.value).toBe(true);
  });

  it('should toggle theme', () => {
    const { toggleTheme, theme } = useThemePreference();
    const initial = theme.value;
    toggleTheme();
    expect(theme.value).not.toBe(initial);
  });
});
