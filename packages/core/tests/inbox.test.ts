import type { MyZRecord } from "@myz/shared/types";
import { describe, it, expect } from "vitest";
import { buildInboxQueue, type InboxStateRow } from "../src/inbox.js";

function record(id: string, createdAt = "2026-01-01T00:00:00Z"): MyZRecord {
  return { id, createdAt } as MyZRecord;
}

const NOW = Date.parse("2026-01-10T00:00:00Z");

describe("buildInboxQueue", () => {
  it("classifies pending / snoozed / marked and counts them", () => {
    const records = [record("a"), record("b"), record("c")];
    const states: InboxStateRow[] = [
      {
        recordId: "status:h:a",
        changedAt: "2026-01-09T00:00:00Z",
        payload: { status: "pending" },
      },
      {
        recordId: "status:h:b",
        changedAt: "2026-01-09T00:00:00Z",
        payload: { status: "snoozed", snoozedUntil: "2026-02-01T00:00:00Z" },
      },
      {
        recordId: "status:h:c",
        changedAt: "2026-01-09T00:00:00Z",
        payload: { status: "kept", handledAt: "2026-01-09T00:00:00Z" },
      },
      {
        recordId: "mark:h:b",
        changedAt: "2026-01-09T00:00:00Z",
        payload: { marked: true },
      },
    ];

    const queue = buildInboxQueue(records, states, NOW);

    expect(queue.counts).toEqual({ pending: 1, snoozed: 1, marked: 1 });
    expect(queue.pending[0].targetId).toBe("h:a");
    expect(queue.snoozed[0].targetId).toBe("h:b");
    expect(queue.marked[0].targetId).toBe("h:b");
    expect(queue.oldestPendingAt).toBe("2026-01-01T00:00:00Z");
  });

  it("treats an overdue snooze as pending", () => {
    const records = [record("a")];
    const states: InboxStateRow[] = [
      {
        recordId: "status:h:a",
        changedAt: "2026-01-01T00:00:00Z",
        payload: { status: "snoozed", snoozedUntil: "2026-01-02T00:00:00Z" },
      },
    ];
    const queue = buildInboxQueue(records, states, NOW);
    expect(queue.counts.pending).toBe(1);
    expect(queue.counts.snoozed).toBe(0);
  });

  it("ignores malformed state ids", () => {
    const queue = buildInboxQueue(
      [record("a")],
      [{ recordId: "bogus", changedAt: "x", payload: {} }],
      NOW,
    );
    expect(queue.counts.pending).toBe(0);
    expect(queue.pending).toHaveLength(0);
  });
});
