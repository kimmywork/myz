import { inboxRelationRecordId } from "@myz/shared/inbox";
import { describe, it, expect } from "vitest";
import type { InboxStateRecord, InboxStateStore } from "../src/ports.js";
import {
  addInboxRelation,
  getInboxStatus,
  listInboxStates,
  removeInboxRelation,
  setInboxMark,
  setInboxStatus,
} from "../src/services/inbox.js";

/** Minimal in-memory InboxStateStore for domain-service tests. */
function memoryInboxStore(): InboxStateStore {
  const map = new Map<string, InboxStateRecord>();
  return {
    async get(recordId) {
      return map.get(recordId);
    },
    async listAll() {
      return [...map.values()];
    },
    async put(record) {
      map.set(record.recordId, record);
    },
    async remove(recordId) {
      map.delete(recordId);
    },
  };
}

describe("inbox service", () => {
  it("writes kept status with handledAt, pending without", async () => {
    const store = memoryInboxStore();
    const kept = await setInboxStatus(store, "h:kept", "kept", {
      now: "2026-01-01T00:00:00Z",
    });
    expect(kept.handledAt).toBe("2026-01-01T00:00:00Z");
    expect((await getInboxStatus(store, "h:kept"))?.status).toBe("kept");

    await setInboxStatus(store, "h:pending", "pending");
    expect((await getInboxStatus(store, "h:pending"))?.handledAt).toBeUndefined();
  });

  it("stores snoozedUntil and marks records", async () => {
    const store = memoryInboxStore();
    await setInboxStatus(store, "h:s", "snoozed", {
      snoozedUntil: "2026-02-01T00:00:00Z",
    });
    expect((await getInboxStatus(store, "h:s"))?.snoozedUntil).toBe(
      "2026-02-01T00:00:00Z",
    );

    await setInboxMark(store, "h:m", true, { now: "2026-01-01T00:00:00Z" });
    expect((await listInboxStates(store)).some((r) => r.recordId === "mark:h:m")).toBe(
      true,
    );
  });

  it("adds and removes per-edge relations", async () => {
    const store = memoryInboxStore();
    await addInboxRelation(store, "h:a", "h:b");
    const id = inboxRelationRecordId("h:a", "h:b");
    expect((await listInboxStates(store)).some((r) => r.recordId === id)).toBe(
      true,
    );

    await removeInboxRelation(store, "h:a", "h:b");
    expect((await listInboxStates(store)).some((r) => r.recordId === id)).toBe(
      false,
    );
  });
});
