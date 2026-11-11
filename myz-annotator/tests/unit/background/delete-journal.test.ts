// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  createDeleteJournal,
  type DeleteJournalEntry,
} from "@/background/delete-journal";

function setup(now = 1_000) {
  let entries: DeleteJournalEntry[] = [];
  const deps = {
    read: vi.fn(async () => entries.map((entry) => ({ ...entry }))),
    write: vi.fn(async (next: DeleteJournalEntry[]) => {
      entries = next.map((entry) => ({ ...entry }));
    }),
    removeRecords: vi.fn(async () => {}),
    recordDeletion: vi.fn(async () => {}),
    anyPresent: vi.fn(async () => false),
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
    const [first, second] = await Promise.all([
      journal.queue(["a"], 7_000),
      journal.queue(["b"], 8_000),
    ]);

    expect(first).toBe(true);
    expect(second).toBe(true);
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

  it("cancel reports whether the intent existed", async () => {
    const { journal, entries } = setup();
    await journal.queue(["a"], 7_000);

    expect(await journal.cancel(["a"])).toBe(true);
    expect(entries()).toEqual([]);
    expect(await journal.cancel(["a"])).toBe(false);
  });

  it("drains only overdue intents and keeps failures for a retry", async () => {
    const { deps, journal, entries, setNow } = setup(1_000);
    await journal.queue(["due"], 1_000);
    await journal.queue(["later"], 99_000);
    deps.removeRecords.mockRejectedValueOnce(new Error("offline"));

    setNow(2_000);
    await journal.drainExpired();
    expect(entries().map((entry) => entry.ids)).toEqual([["due"], ["later"]]);

    await journal.drainExpired();
    expect(entries().map((entry) => entry.ids)).toEqual([["later"]]);
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
    expect(entries().map((entry) => entry.ids)).toEqual([["c"]]);
  });

  it("lists every pending id", async () => {
    const { journal } = setup();
    await journal.queue(["a"], 1_000);
    await journal.queue(["b", "c"], 2_000);
    expect((await journal.pendingIds()).sort()).toEqual(["a", "b", "c"]);
  });
});
