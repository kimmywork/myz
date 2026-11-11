// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  createDeleteJournal,
  type DeleteJournalEntry,
} from "@/background/delete-journal";

function setup(now = 1_000) {
  let entries: DeleteJournalEntry[] = [];
  let writeFails = false;
  const deps = {
    read: vi.fn(async () => entries.map((entry) => ({ ...entry }))),
    write: vi.fn(async (next: DeleteJournalEntry[]) => {
      if (writeFails) throw new Error("storage down");
      entries = next.map((entry) => ({ ...entry }));
    }),
    removeRecords: vi.fn(async () => {}),
    recordDeletion: vi.fn(async () => {}),
    anyPresent: vi.fn(async () => false),
    clearDeletions: vi.fn(async () => {}),
    onTombstoneFailure: vi.fn(),
    now: () => now,
  };
  const journal = createDeleteJournal(deps);
  return {
    deps,
    journal,
    entries: () => entries,
    setNow: (value: number) => {
      now = value;
    },
    setWriteFails: (value: boolean) => {
      writeFails = value;
    },
  };
}

describe("delete journal", () => {
  it("persists an intent before anything is deleted", async () => {
    const { deps, journal, entries } = setup();
    expect(await journal.queue(["a", "b"], 7_000)).toBe(true);
    expect(entries()).toEqual([{ ids: ["a", "b"], dueAt: 7_000 }]);
    expect(deps.removeRecords).not.toHaveBeenCalled();
  });

  it("keeps both intents when two queues arrive in the same tick", async () => {
    const { journal, entries } = setup();
    await Promise.all([
      journal.queue(["a"], 7_000),
      journal.queue(["b"], 8_000),
    ]);
    expect(entries().map((entry) => entry.ids)).toEqual([["a"], ["b"]]);
  });

  it("commits one intent: tombstones, one batch remove, entry cleared", async () => {
    const { deps, journal, entries } = setup();
    await journal.queue(["a", "b"], 7_000);

    expect(await journal.commit(["b", "a"])).toBe(true);
    expect(deps.recordDeletion).toHaveBeenCalledTimes(2);
    expect(deps.removeRecords).toHaveBeenCalledWith(["a", "b"]);
    expect(entries()).toEqual([]);
  });

  it("finishes the delete when the intent is gone but records remain", async () => {
    const { deps, journal } = setup();
    deps.anyPresent.mockResolvedValueOnce(true);

    expect(await journal.commit(["lost"])).toBe(true);
    expect(deps.removeRecords).toHaveBeenCalledWith(["lost"]);
  });

  it("fails when a lost intent cannot be finished", async () => {
    const { deps, journal } = setup();
    deps.anyPresent.mockResolvedValueOnce(true);
    deps.removeRecords.mockRejectedValueOnce(new Error("offline"));

    expect(await journal.commit(["lost"])).toBe(false);
  });

  it("treats a missing intent as committed only when storage agrees", async () => {
    const { deps, journal } = setup();
    deps.anyPresent.mockResolvedValueOnce(false);

    expect(await journal.commit(["gone"])).toBe(true);
    expect(deps.removeRecords).not.toHaveBeenCalled();
  });

  it("does not delete records after their intent was cancelled", async () => {
    const { deps, journal, entries } = setup();
    await journal.queue(["a"], 1_000);
    expect(await journal.cancel(["a"])).toBe(true);
    expect(entries()[0].cancelled).toBe(true);
    deps.anyPresent.mockResolvedValueOnce(true);

    expect(await journal.commit(["a"])).toBe(true);
    expect(deps.removeRecords).not.toHaveBeenCalled();
    expect(await journal.pendingIds()).toEqual([]);
  });

  it("reports a cancel for an unknown intent as false", async () => {
    const { journal } = setup();
    expect(await journal.cancel(["missing"])).toBe(false);
  });

  it("keeps the intent as a tombstone retry marker when a tombstone fails", async () => {
    const { deps, journal, entries, setNow } = setup();
    await journal.queue(["a"], 1_000);
    deps.recordDeletion.mockRejectedValueOnce(new Error("sync down"));

    expect(await journal.commit(["a"])).toBe(true);
    expect(deps.removeRecords).toHaveBeenCalledWith(["a"]);
    expect(entries().map((entry) => entry.ids)).toEqual([["a"]]);
    expect(deps.onTombstoneFailure).toHaveBeenCalledWith(["a"]);

    // The next drain retries the tombstone and clears the intent.
    setNow(2_000);
    await journal.drainExpired();
    expect(entries()).toEqual([]);
    expect(deps.recordDeletion).toHaveBeenCalledTimes(2);
  });

  it("reports success and keeps the intent when intent cleanup fails", async () => {
    const { deps, journal, entries, setWriteFails } = setup();
    await journal.queue(["a"], 1_000);
    setWriteFails(true);

    expect(await journal.commit(["a"])).toBe(true);
    expect(deps.removeRecords).toHaveBeenCalledWith(["a"]);
    expect(entries().map((entry) => entry.ids)).toEqual([["a"]]);
  });

  it("drains overdue intents, skips cancelled ones and prunes old markers", async () => {
    const { journal, entries, setNow } = setup(1_000);
    await journal.queue(["due"], 1_000);
    await journal.queue(["later"], 99_000);
    await journal.queue(["undone"], 1_000);
    await journal.cancel(["undone"]);

    setNow(2_000);
    await journal.drainExpired();
    // The cancelled marker is kept for a while so a late commit is a no-op.
    expect(entries().map((entry) => entry.ids)).toEqual([["later"], ["undone"]]);

    setNow(200_000);
    await journal.drainExpired();
    // The old cancelled marker is pruned and the overdue intent committed.
    expect(entries()).toEqual([]);
  });

  it("does not deadlock when operations are mixed concurrently", async () => {
    const { journal, entries } = setup();
    await journal.queue(["a"], 1_000);
    await journal.queue(["b"], 2_000);

    const results = await Promise.all([
      journal.queue(["c"], 3_000),
      journal.cancel(["a"]),
      journal.commit(["b"]),
      journal.drainExpired(),
      journal.pendingIds(),
    ]);

    expect(results).toHaveLength(5);
    const remaining = entries();
    expect(remaining.map((entry) => entry.ids)).toEqual([["a"], ["c"]]);
    expect(remaining[0].cancelled).toBe(true);
  });

  it("lists every pending id except cancelled ones", async () => {
    const { journal } = setup();
    await journal.queue(["a"], 1_000);
    await journal.queue(["b", "c"], 2_000);
    await journal.cancel(["a"]);
    expect((await journal.pendingIds()).sort()).toEqual(["b", "c"]);
  });
});
