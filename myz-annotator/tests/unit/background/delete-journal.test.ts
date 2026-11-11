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
    expect(deps.write).toHaveBeenCalledTimes(1);
    expect(entries()).toEqual([{ ids: ["a", "b"], dueAt: 7_000 }]);
    expect(deps.removeRecords).not.toHaveBeenCalled();
  });

  it("commits one intent: tombstones, one batch remove, entry cleared", async () => {
    const { deps, journal, entries } = setup();
    await journal.queue(["a", "b"], 7_000);

    expect(await journal.commit(["b", "a"])).toBe(true);
    expect(deps.recordDeletion).toHaveBeenCalledTimes(2);
    expect(deps.removeRecords).toHaveBeenCalledWith(["a", "b"]);
    expect(entries()).toEqual([]);
  });

  it("treats an already committed intent as committed (idempotent)", async () => {
    const { deps, journal } = setup();
    await journal.queue(["a"], 7_000);
    await journal.commit(["a"]);

    expect(await journal.commit(["a"])).toBe(true);
    expect(deps.removeRecords).toHaveBeenCalledTimes(1);
  });

  it("cancel drops the intent without deleting", async () => {
    const { deps, journal, entries } = setup();
    await journal.queue(["a"], 7_000);

    await journal.cancel(["a"]);
    expect(entries()).toEqual([]);
    expect(deps.removeRecords).not.toHaveBeenCalled();
  });

  it("drains only overdue intents and keeps failures for a retry", async () => {
    const { deps, journal, entries, setNow } = setup(1_000);
    await journal.queue(["due"], 1_000);
    await journal.queue(["later"], 99_000);
    deps.removeRecords.mockRejectedValueOnce(new Error("offline"));

    setNow(2_000);
    await journal.drainExpired();

    // The failed entry stays; the not-yet-due one is untouched.
    expect(entries().map((entry) => entry.ids)).toEqual([["due"], ["later"]]);
    expect(deps.removeRecords).toHaveBeenCalledTimes(1);

    await journal.drainExpired();
    expect(entries().map((entry) => entry.ids)).toEqual([["later"]]);
  });

  it("lists every pending id", async () => {
    const { journal } = setup();
    await journal.queue(["a"], 1_000);
    await journal.queue(["b", "c"], 2_000);
    expect((await journal.pendingIds()).sort()).toEqual(["a", "b", "c"]);
  });
});
