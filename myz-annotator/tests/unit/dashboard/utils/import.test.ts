import { MyZRecord, RECORD_KINDS, SOURCE_TYPES } from "@myz/shared/types";
import { RECORD_SCHEMA_VERSION } from "@myz/shared/versioning";
import { describe, it, expect } from "vitest";
import {
  appendImportedTag,
  normalizeImportedPayload,
  parseImportFile,
} from "@/dashboard/utils/import";

describe("import normalizeImportedPayload", () => {
  const baseRecord = {
    id: "1",
    kind: "highlight",
    text: "",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    url: "https://example.com",
  };
  const normalizedRecord = {
    ...baseRecord,
    contentType: "text/plain",
    sourceType: SOURCE_TYPES.WEB,
    schemaVersion: RECORD_SCHEMA_VERSION,
  };

  it("should return array if payload is array", () => {
    const payload = [baseRecord];
    expect(normalizeImportedPayload(payload)).toEqual([normalizedRecord]);
  });

  it("should return highlights if payload has highlights array", () => {
    const payload = { highlights: [baseRecord] };
    expect(normalizeImportedPayload(payload)).toEqual([normalizedRecord]);
  });

  it("should return data if payload has data array", () => {
    const payload = { data: [baseRecord] };
    expect(normalizeImportedPayload(payload)).toEqual([normalizedRecord]);
  });

  it("should return empty array for invalid payload", () => {
    expect(normalizeImportedPayload(null)).toEqual([]);
    expect(normalizeImportedPayload(undefined)).toEqual([]);
    expect(normalizeImportedPayload({})).toEqual([]);
    expect(normalizeImportedPayload({ other: [] })).toEqual([]);
  });

  it("should drop items that cannot be normalized", () => {
    const payload = [baseRecord, null, { id: "invalid-no-url" }, "string item"];
    const result = normalizeImportedPayload(payload);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });
});

describe("import appendImportedTag", () => {
  const record = (partial: Partial<MyZRecord> = {}): MyZRecord =>
    ({
      schemaVersion: RECORD_SCHEMA_VERSION,
      id: "r",
      kind: RECORD_KINDS.CLIP,
      text: "t",
      url: "https://example.com",
      sourceUrl: "https://example.com",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
      ...partial,
    }) as MyZRecord;

  it("should append imported tag when absent", () => {
    const result = appendImportedTag([record({ tags: ["a"] })]);
    expect(result[0].tags).toEqual(["a", "imported"]);
  });

  it("should append imported tag when tags are empty", () => {
    const result = appendImportedTag([record({ tags: [] })]);
    expect(result[0].tags).toEqual(["imported"]);
  });

  it("should not duplicate existing imported tag", () => {
    const result = appendImportedTag([record({ tags: ["imported"] })]);
    expect(result[0].tags).toEqual(["imported"]);
  });

  it("should dedupe imported tag case-insensitively without adding a duplicate", () => {
    const result = appendImportedTag([record({ tags: ["Imported", ""] })]);
    expect(result[0].tags).toEqual(["Imported"]);
  });
});

describe("import parseImportFile", () => {
  const makeFile = (name: string, text: string, type = "") =>
    new File([text], name, { type });

  it("should parse a MyZ JSON array via auto detection", () => {
    const text = JSON.stringify([
      {
        id: "j1",
        kind: "clip",
        url: "https://example.com/json-a",
        text: "json snippet a",
        tags: ["json"],
        createdAt: "2024-06-01T10:00:00.000Z",
        updatedAt: "2024-06-01T10:00:00.000Z",
      },
    ]);
    const { format, records } = parseImportFile(
      makeFile("export.json", text, "application/json"),
      text,
    );
    expect(format).toBe("json");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: "j1",
      kind: RECORD_KINDS.CLIP,
      url: "https://example.com/json-a",
      text: "json snippet a",
      tags: ["json"],
    });
  });

  it("should detect JSON from object content even without a matching filename", () => {
    const text = JSON.stringify({
      highlights: [
        {
          id: "j2",
          kind: "clip",
          url: "https://example.com/json-b",
          text: "json snippet b",
          createdAt: "2024-06-01T10:00:00.000Z",
          updatedAt: "2024-06-01T10:00:00.000Z",
        },
      ],
    });
    const { format, records } = parseImportFile(
      makeFile("data.txt", text),
      text,
    );
    expect(format).toBe("json");
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe("j2");
  });

  it("should throw for invalid JSON under forced myz-json source", () => {
    expect(() =>
      parseImportFile(
        makeFile("broken.json", "{not json"),
        "unused",
        "myz-json",
      ),
    ).toThrow("JSON 格式无效");
  });

  it("should parse RainDrop CSV via auto detection", () => {
    const csv = [
      "url,title,excerpt,note,tags,created,highlights",
      'https://example.com/rd,Raindrop Title,excerpt here,note here,"a, b","2024-05-01T08:00:00.000Z","Highlight: first quote\nHighlight: second quote"',
    ].join("\n");
    const { format, records } = parseImportFile(
      makeFile("raindrop.csv", csv, "text/csv"),
      csv,
    );
    expect(format).toBe("raindrop");
    expect(records.length).toBe(3);
    expect(records[0]).toMatchObject({
      kind: RECORD_KINDS.BOOKMARK,
      url: "https://example.com/rd",
      title: "Raindrop Title",
      tags: ["a", "b"],
    });
    expect(records[1]).toMatchObject({
      kind: RECORD_KINDS.CLIP,
      text: "first quote",
    });
    expect(records[2]).toMatchObject({
      kind: RECORD_KINDS.CLIP,
      text: "second quote",
    });
  });

  it("should parse RainDrop CSV under forced source regardless of filename", () => {
    const csv = [
      "url,title,excerpt,note,tags,created,highlights",
      "https://example.com/rd2,Raindrop Two,excerpt,,tag,2024-05-02T00:00:00.000Z,",
    ].join("\n");
    const { format, records } = parseImportFile(
      makeFile("notes.txt", csv),
      csv,
      "raindrop-csv",
    );
    expect(format).toBe("raindrop");
    expect(records).toHaveLength(1);
    expect(records[0].url).toBe("https://example.com/rd2");
  });

  it("should throw when RainDrop CSV lacks a url column", () => {
    const csv = "title,note\nNo Url,oops\n";
    expect(() => parseImportFile(makeFile("bad.csv", csv), csv)).toThrow(
      "CSV 缺少 url 列",
    );
  });

  it("should parse Weava CSV via auto detection", () => {
    const csv = [
      "website title,url,highlighted text/image url,note,date",
      "Weava Site,https://example.com/weava,quoted text,note,2024-04-01T12:00:00.000Z",
    ].join("\n");
    const { format, records } = parseImportFile(
      makeFile("weava.csv", csv, "text/csv"),
      csv,
    );
    expect(format).toBe("weava");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      kind: RECORD_KINDS.CLIP,
      url: "https://example.com/weava",
      text: "quoted text",
      note: "note",
    });
  });

  it("should parse Chrome bookmarks HTML via .html filename", () => {
    const html =
      '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<TITLE>Bookmarks</TITLE>\n<DL><p>\n<DT><A HREF="https://example.com/b1" ADD_DATE="1710000000">Bookmark One</A>\n</DL><p>';
    const { format, records } = parseImportFile(
      makeFile("bookmarks.html", html, "text/html"),
      html,
    );
    expect(format).toBe("chrome-bookmarks");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      kind: RECORD_KINDS.BOOKMARK,
      url: "https://example.com/b1",
      title: "Bookmark One",
    });
  });

  it("should detect Chrome bookmarks from NETSCAPE header without a matching filename", () => {
    const html =
      '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<DT><A HREF="https://example.com/b2">Bookmark Two</A>';
    const { format, records } = parseImportFile(
      makeFile("data.dat", html),
      html,
    );
    expect(format).toBe("chrome-bookmarks");
    expect(records).toHaveLength(1);
    expect(records[0].url).toBe("https://example.com/b2");
  });

  it("should throw when the file format cannot be recognized", () => {
    expect(() =>
      parseImportFile(makeFile("notes.txt", "hello world"), "hello world"),
    ).toThrow("无法识别导入文件格式");
    expect(() => parseImportFile(makeFile("", ""), "")).toThrow(
      "无法识别导入文件格式",
    );
  });
});
