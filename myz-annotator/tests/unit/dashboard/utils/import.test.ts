import { describe, it, expect } from "vitest";
import { normalizeImportedPayload } from "@/dashboard/utils/import";

describe("import", () => {
  const baseRecord = {
    id: "1",
    kind: "highlight",
    text: "",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    url: "https://example.com",
  };

  it("should return array if payload is array", () => {
    const payload = [baseRecord];
    expect(normalizeImportedPayload(payload)).toEqual(payload);
  });

  it("should return highlights if payload has highlights array", () => {
    const payload = { highlights: [baseRecord] };
    expect(normalizeImportedPayload(payload)).toEqual(payload.highlights);
  });

  it("should return data if payload has data array", () => {
    const payload = { data: [baseRecord] };
    expect(normalizeImportedPayload(payload)).toEqual(payload.data);
  });

  it("should return empty array for invalid payload", () => {
    expect(normalizeImportedPayload(null)).toEqual([]);
    expect(normalizeImportedPayload(undefined)).toEqual([]);
    expect(normalizeImportedPayload({})).toEqual([]);
    expect(normalizeImportedPayload({ other: [] })).toEqual([]);
  });
});
