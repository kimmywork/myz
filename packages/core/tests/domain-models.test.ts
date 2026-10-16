import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  backlinksOf,
  createPayloadCodecRegistry,
  createSourceKindRegistry,
  currentLifecycleStatus,
  isLifecycleActive,
  normalizeLocator,
  parseRecordId,
  parseRelationRecordId,
  recordIdForHighlight,
  relationRecordId,
  sourceKinds,
  transitionLifecycle,
} from "../src/index.js";

describe("identity", () => {
  it("round-trips highlight record ids", () => {
    const recordId = recordIdForHighlight("abc");
    expect(recordId).toBe("h:abc");
    expect(parseRecordId(recordId)).toEqual({ kind: "highlight", id: "abc" });
  });

  it("returns null for unknown prefixes", () => {
    expect(parseRecordId("status:h:abc")).toBeNull();
    expect(parseRecordId("x:1")).toBeNull();
  });
});

describe("source kind registry", () => {
  it("ships the built-in web/pdf/epub kinds", () => {
    expect(sourceKinds.get("web")?.identity).toBe("url");
    expect(sourceKinds.get("pdf")?.capabilities.paged).toBe(true);
    expect(sourceKinds.get("epub")?.capabilities.reflow).toBe(true);
    expect(sourceKinds.get("pdf")?.urlPrefix).toBe("myz-pdf:");
  });

  it("supports registering new kinds", () => {
    const registry = createSourceKindRegistry();
    registry.register({ kind: "docx", identity: "fingerprint", capabilities: {} });
    expect(registry.get("docx")?.identity).toBe("fingerprint");
    expect(sourceKinds.get("docx")).toBeUndefined();
  });
});

describe("locator normalization", () => {
  it("prefers a text range, then pdf, then epub", () => {
    expect(normalizeLocator({ range: { any: 1 } })?.kind).toBe("text-range");
    expect(normalizeLocator({ pdfLocator: { page: 2 } })?.kind).toBe(
      "pdf-page-rect",
    );
    expect(normalizeLocator({ epubLocator: { spine: 1 } })?.kind).toBe("epub");
  });

  it("returns null when no locator field is set", () => {
    expect(normalizeLocator({})).toBeNull();
  });
});

describe("payload codec registry", () => {
  const schemaV1 = z.object({ title: z.string() });

  it("registers, parses, and reports presence", () => {
    const registry = createPayloadCodecRegistry();
    registry.register({
      schemaId: "myz.note",
      currentVersion: 1,
      schema: schemaV1,
    });
    expect(registry.has("myz.note")).toBe(true);
    expect(registry.parse("myz.note", { title: "hi" }, 1)).toEqual({
      title: "hi",
    });
  });

  it("migrates an older blob before parsing", () => {
    const registry = createPayloadCodecRegistry();
    registry.register({
      schemaId: "myz.note",
      currentVersion: 2,
      schema: z.object({ title: z.string(), body: z.string() }),
      migrate: (blob) => ({ ...(blob as object), body: "" }),
    });
    expect(registry.parse("myz.note", { title: "hi" }, 1)).toEqual({
      title: "hi",
      body: "",
    });
  });

  it("throws for an unknown schemaId", () => {
    const registry = createPayloadCodecRegistry();
    expect(() => registry.parse("missing", {}, 1)).toThrow(
      "Unknown payload schemaId: missing",
    );
  });
});

describe("lifecycle", () => {
  it("marks handledAt on terminal statuses", () => {
    const kept = transitionLifecycle("h:1", "kept", { now: "2026-01-01T00:00:00Z" });
    expect(kept.handledAt).toBe("2026-01-01T00:00:00Z");
    expect(kept.status).toBe("kept");
  });

  it("records snoozedUntil only when snoozed", () => {
    const snoozed = transitionLifecycle("h:1", "snoozed", {
      snoozedUntil: "2026-02-01T00:00:00Z",
    });
    expect(snoozed.snoozedUntil).toBe("2026-02-01T00:00:00Z");
    expect(snoozed.handledAt).toBeUndefined();
  });

  it("defaults to kept and reports active pending", () => {
    expect(currentLifecycleStatus(null)).toBe("kept");
    expect(isLifecycleActive(null)).toBe(false);
    expect(
      isLifecycleActive(
        { targetId: "h:1", status: "pending", changedAt: "x" },
        0,
      ),
    ).toBe(true);
  });
});

describe("relations", () => {
  it("round-trips relation ids and finds backlinks", () => {
    const relation = { sourceId: "h:1", targetId: "h:2" };
    const recordId = relationRecordId(relation);
    expect(parseRelationRecordId(recordId)).toEqual(relation);
    expect(backlinksOf([relation], "h:2")).toEqual([relation]);
    expect(backlinksOf([relation], "h:1")).toEqual([]);
    expect(parseRelationRecordId("status:h:1")).toBeNull();
  });
});
