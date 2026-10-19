import { RECORD_KINDS } from "@myz/shared/types";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildInboxQueue } from "../src/inbox.js";
import { createPayloadCodecRegistry } from "../src/payload-codec.js";
import {
  backlinksOf,
  parseRelationRecordId,
  type Relation,
} from "../src/relations.js";
import { addInboxRelation, setInboxStatus } from "../src/services/inbox.js";
import {
  createRecord,
  listRecords,
  updateRecord,
} from "../src/services/records.js";
import { createNodeHost } from "./support/node-host.js";

/**
 * End-to-end integration of the domain layer against a **non-extension** host
 * adapter (plain in-memory Maps, no chrome/IndexedDB). If this passes, the core
 * is host-independent and a desktop/mobile host only needs to provide adapters.
 */
describe("node host integration (ports only)", () => {
  it("runs records, inbox, relations, codecs and changes over a plain adapter", async () => {
    const host = createNodeHost({ colorScheme: "paper" });
    const events: string[] = [];
    host.changes.subscribe((event) => events.push(event.domain));

    // Records service.
    const record = await createRecord(
      host.records,
      { text: "alpha", url: "https://example.com/a", kind: RECORD_KINDS.HIGHLIGHT },
      { newId: () => "r1", now: () => "2026-01-01T00:00:00Z" },
    );
    host.changes.publish({ domain: "records", ids: [record.id] });
    expect(record.id).toBe("r1");

    await updateRecord(
      host.records,
      "r1",
      { text: "beta" },
      { now: () => "2026-01-02T00:00:00Z" },
    );
    expect((await listRecords(host.records))[0].text).toBe("beta");

    // Inbox service + read model.
    await setInboxStatus(host.inbox, "h:r1", "pending", {
      now: "2026-01-02T00:00:00Z",
    });
    const queue = buildInboxQueue(
      await host.records.listAll(),
      await host.inbox.listAll(),
      Date.parse("2026-01-03T00:00:00Z"),
    );
    expect(queue.counts.pending).toBe(1);
    expect(queue.pending[0].targetId).toBe("h:r1");

    // Relations / backlinks.
    await addInboxRelation(host.inbox, "h:r1", "h:r2");
    const relations = (await host.inbox.listAll())
      .map((row) => parseRelationRecordId(row.recordId))
      .filter((relation): relation is Relation => relation !== null);
    expect(backlinksOf(relations, "h:r2")).toEqual([
      { sourceId: "h:r1", targetId: "h:r2" },
    ]);

    // Settings port.
    expect((await host.settings.read()).colorScheme).toBe("paper");
    await host.settings.write({ colorScheme: "slate" });
    expect((await host.settings.read()).colorScheme).toBe("slate");

    // Payload codec (domain-side schema registry; sync stays data-agnostic).
    const codecs = createPayloadCodecRegistry();
    codecs.register({
      schemaId: "myz.note",
      currentVersion: 1,
      schema: z.object({ title: z.string() }),
    });
    expect(codecs.parse("myz.note", { title: "hi" }, 1)).toEqual({
      title: "hi",
    });

    // Change notification reached the subscriber.
    expect(events).toEqual(["records"]);
  });

  it("preserves opaque records and clears them on delete", async () => {
    const host = createNodeHost();
    await host.records.putOpaque({
      streamId: "highlights",
      recordId: "n:future",
      updatedAt: "2026-01-01T00:00:00Z",
      data: { schemaId: "future.kind" },
    });
    expect(await host.records.listOpaque("highlights")).toHaveLength(1);
    await host.records.deleteOpaque("highlights", "n:future");
    expect(await host.records.listOpaque("highlights")).toHaveLength(0);
  });
});
