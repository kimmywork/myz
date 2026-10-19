import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordsStore } from "@/background/stores";
import { createHighlightDataset } from "@/background/sync/v2/datasets";
import { createInboxDataset } from "@/background/sync/v2/inboxDataset";

const NOW = "2026-02-02T00:00:00Z";

function stubChrome() {
  vi.stubGlobal("chrome", {
    storage: { local: { get: async () => ({}), remove: async () => {} } },
  });
}

describe("highlight dataset opaque closure (D1)", () => {
  beforeEach(stubChrome);

  it("preserves an unknown record and hands it back on collect", async () => {
    const dataset = createHighlightDataset();
    const unknownId = "n:future-1";

    // An older client receives a record it cannot materialize.
    await dataset.apply({
      recordId: unknownId,
      updatedAt: NOW,
      data: { schemaId: "future.kind", body: "keep me" },
      recordHash: "x",
    });

    // It must not be materialized as a highlight...
    expect((await recordsStore.listAll()).map((r) => r.id)).not.toContain(
      unknownId,
    );

    // ...but it must be present in the opaque overflow and returned by collect,
    // so the next sync re-pushes it instead of dropping it.
    const collected = await dataset.collect();
    const preserved = collected.find((r) => r.recordId === unknownId);
    expect(preserved).toBeDefined();
    expect(preserved?.data).toEqual({
      schemaId: "future.kind",
      body: "keep me",
    });
  });

  it("preserves an h:-prefixed record whose payload id does not match", async () => {
    const dataset = createHighlightDataset();
    // A future highlight payload (or a mismatched id) must not be upserted as
    // a real record — it stays opaque and round-trips verbatim.
    await dataset.apply({
      recordId: "h:future-1",
      updatedAt: NOW,
      data: { schemaId: "future.highlight" },
      recordHash: "m",
    });
    expect((await recordsStore.listAll()).map((r) => r.id)).not.toContain(
      "future-1",
    );
    const preserved = (await dataset.collect()).find(
      (r) => r.recordId === "h:future-1",
    );
    expect(preserved?.data).toEqual({ schemaId: "future.highlight" });

    // Removing the `h:` record must also clear its opaque overflow entry,
    // otherwise it would resurrect on the next collect.
    await dataset.remove("h:future-1");
    expect(
      (await recordsStore.listOpaque("highlights")).some(
        (r) => r.recordId === "h:future-1",
      ),
    ).toBe(false);
    expect(
      (await dataset.collect()).some((r) => r.recordId === "h:future-1"),
    ).toBe(false);
  });

  it("materializes a normal highlight and round-trips it", async () => {
    const dataset = createHighlightDataset();
    await dataset.apply({
      recordId: "h:real-1",
      updatedAt: NOW,
      data: { id: "real-1", kind: "highlight", text: "t", url: "u" },
      recordHash: "y",
    });
    expect((await recordsStore.listAll()).map((r) => r.id)).toContain("real-1");
    const collected = await dataset.collect();
    expect(collected.find((r) => r.recordId === "h:real-1")).toBeDefined();
  });

  it("deletes an opaque record on remote removal", async () => {
    const dataset = createHighlightDataset();
    await dataset.apply({
      recordId: "n:future-2",
      updatedAt: NOW,
      data: {},
      recordHash: "z",
    });
    await dataset.remove("n:future-2");
    expect(
      (await recordsStore.listOpaque("highlights")).find(
        (r) => r.recordId === "n:future-2",
      ),
    ).toBeUndefined();
  });
});

describe("inbox dataset opaque closure (D1)", () => {
  beforeEach(stubChrome);

  it("preserves an unknown inbox record under the inbox stream", async () => {
    const dataset = createInboxDataset();
    await dataset.apply({
      recordId: "weird:1",
      updatedAt: NOW,
      data: { anything: true },
      recordHash: "w",
    });
    const collected = await dataset.collect();
    expect(collected.find((r) => r.recordId === "weird:1")).toBeDefined();
    expect(await recordsStore.listOpaque("inbox")).toHaveLength(1);
  });
});
