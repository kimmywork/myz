import { describe, it, expect } from 'vitest';
import { normalizeImportedPayload } from '../../../../src/dashboard/utils/import';

describe('import', () => {
  it('should return array if payload is array', () => {
    const payload = [{ id: '1' }];
    expect(normalizeImportedPayload(payload)).toBe(payload);
  });

  it('should return highlights if payload has highlights array', () => {
    const payload = { highlights: [{ id: '1' }] };
    expect(normalizeImportedPayload(payload)).toBe(payload.highlights);
  });

  it('should return data if payload has data array', () => {
    const payload = { data: [{ id: '1' }] };
    expect(normalizeImportedPayload(payload)).toBe(payload.data);
  });

  it('should return empty array for invalid payload', () => {
    expect(normalizeImportedPayload(null)).toEqual([]);
    expect(normalizeImportedPayload(undefined)).toEqual([]);
    expect(normalizeImportedPayload({})).toEqual([]);
    expect(normalizeImportedPayload({ other: [] })).toEqual([]);
  });
});
