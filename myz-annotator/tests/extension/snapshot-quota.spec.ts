import { test, expect } from "@playwright/test";
import { send, setupDashboardHarness } from "../helpers/dashboard-harness.js";

const harness = setupDashboardHarness();

/** A snapshot whose body really is about `kb` KB — the store measures it. */
function snapshot(id: string, kb: number) {
  const body = "x".repeat(kb * 1024);
  return {
    recordId: `rec-${id}`,
    url: `https://example.com/${id}`,
    title: `Page ${id}`,
    html: `<p>${id}</p><p>${body}</p>`,
    css: "",
  };
}

/**
 * Fills the store to near quota with 9 MB snapshots (the per-snapshot cap is
 * 10 MB, so each is accepted) and checks that the next one evicts the oldest.
 */
test("snapshot_quota_evicts_the_oldest_and_never_half_writes", async () => {
  // A fresh profile per spec file, so the store starts empty.
  const dash = await harness.open("/highlights");
  const ids: string[] = [];
  // 8 × 9 MB = 72 MB of the 80 MB budget.
  for (let index = 0; index < 8; index += 1) {
    const result = await send<{ ok: boolean; id?: string; evicted?: string[] }>(
      dash,
      "myz:saveSnapshot",
      snapshot(`fill-${index}`, 9 * 1024),
    );
    expect(result.ok).toBe(true);
    expect(result.evicted ?? []).toEqual([]);
    ids.push(result.id!);
  }

  // The ninth pushes past the budget: the very first snapshot must go.
  const ninth = await send<{
    ok: boolean;
    id?: string;
    evicted?: string[];
    announceEviction?: boolean;
  }>(dash, "myz:saveSnapshot", snapshot("ninth", 9 * 1024));

  expect(ninth.ok).toBe(true);
  expect(ninth.evicted).toContain(ids[0]);
  expect(ninth.announceEviction).toBe(true);

  // The evicted one is gone, the new one is complete and readable.
  const evicted = await send<unknown>(dash, "myz:getSnapshotForRecord", {
    recordId: "rec-fill-0",
  });
  expect(evicted).toBeNull();
  const kept = await send<{ html: string; bytes: number } | null>(
    dash,
    "myz:getSnapshotForRecord",
    { recordId: "rec-ninth" },
  );
  expect(kept?.bytes).toBeGreaterThan(9 * 1024 * 1024);
  expect(kept?.html).toContain("ninth");
});

test("snapshot_write_failure_is_visible_not_silent", async () => {
  const dash = await harness.open("/highlights");

  // Above the single-snapshot cap: the store must refuse, not evict everything.
  const tooBig = await send<{
    ok: boolean;
    error?: string;
    evicted?: string[];
  // ~11 MB body: above the 10 MB single-snapshot cap.
  }>(dash, "myz:saveSnapshot", snapshot("too-big", 11 * 1024));
  expect(tooBig.ok).toBe(false);
  expect(tooBig.error).toBeTruthy();
  expect(tooBig.evicted ?? []).toEqual([]);

  // And nothing was stored for it.
  const stored = await send<unknown>(dash, "myz:getSnapshotForRecord", {
    recordId: "rec-too-big",
  });
  expect(stored).toBeNull();

  // An empty body is refused with its own message.
  const empty = await send<{ ok: boolean; error?: string }>(
    dash,
    "myz:saveSnapshot",
    { ...snapshot("empty", 1), html: "" },
  );
  expect(empty.ok).toBe(false);
  expect(empty.error).toContain("正文为空");
});
