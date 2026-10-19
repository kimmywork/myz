import type { MyZRecord } from "@myz/shared/types";
import { describe, expect, it } from "vitest";
import {
  resolveReaderLocator,
  resolveRecordLocator,
  resolveSourceIdentity,
  resolveSourceKind,
} from "../src/source.js";

describe("resolveSourceKind", () => {
  it("defaults to web and honours sourceType", () => {
    expect(resolveSourceKind({ url: "https://example.com/a" })?.kind).toBe(
      "web",
    );
    expect(
      resolveSourceKind({
        sourceType: "pdf" as MyZRecord["sourceType"],
        url: "myz-pdf:abc",
      })?.kind,
    ).toBe("pdf");
  });

  it("infers local-file kinds from the synthetic url prefix", () => {
    expect(resolveSourceKind({ url: "myz-pdf:abc" })?.kind).toBe("pdf");
    expect(resolveSourceKind({ url: "myz-epub:abc" })?.kind).toBe("epub");
  });

  it("does not throw on a malformed persisted url", () => {
    expect(
      resolveSourceKind({ url: 123 as unknown as string })?.kind,
    ).toBe("web");
  });
});

describe("resolveSourceIdentity", () => {
  it("uses the url for web sources", () => {
    expect(resolveSourceIdentity({ url: "https://example.com/a" })).toEqual({
      kind: "web",
      scheme: "url",
      value: "https://example.com/a",
    });
  });

  it("strips the prefix for fingerprint sources", () => {
    expect(resolveSourceIdentity({ url: "myz-pdf:abc123" })).toEqual({
      kind: "pdf",
      scheme: "fingerprint",
      value: "abc123",
    });
  });

  it("returns null when there is no identity", () => {
    expect(resolveSourceIdentity({ url: "myz-pdf:" })).toBeNull();
  });
});

describe("resolveReaderLocator", () => {
  it("prefers the source-specific pdf/epub locator over a text range", () => {
    expect(
      resolveReaderLocator({
        range: { any: 1 } as MyZRecord["range"],
        pdfLocator: { pageNumber: 3 } as MyZRecord["pdfLocator"],
      })?.kind,
    ).toBe("pdf-page-rect");
    expect(
      resolveReaderLocator({
        range: { any: 1 } as MyZRecord["range"],
        epubLocator: { spineIndex: 2 } as MyZRecord["epubLocator"],
      })?.kind,
    ).toBe("epub");
    expect(resolveReaderLocator({ range: {} as MyZRecord["range"] })).toBeNull();
  });
});

describe("resolveRecordLocator", () => {
  it("prefers text range, then pdf, then epub", () => {
    expect(
      resolveRecordLocator({ range: { any: 1 } as MyZRecord["range"] })?.kind,
    ).toBe("text-range");
    expect(
      resolveRecordLocator({
        pdfLocator: { pageNumber: 2 } as MyZRecord["pdfLocator"],
      })?.kind,
    ).toBe("pdf-page-rect");
    expect(
      resolveRecordLocator({
        epubLocator: { spineIndex: 1 } as MyZRecord["epubLocator"],
      })?.kind,
    ).toBe("epub");
    expect(resolveRecordLocator({})).toBeNull();
  });
});
