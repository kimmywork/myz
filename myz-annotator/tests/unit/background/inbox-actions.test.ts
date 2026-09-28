// @vitest-environment node
import "fake-indexeddb/auto";
import { inboxRelationRecordId } from "@myz/shared/inbox";
import { describe, expect, it } from "vitest";
import {
  addInboxRelation,
  getInboxStatus,
  listInboxStates,
  removeInboxRelation,
  setInboxMark,
  setInboxStatus,
} from "@/background/inbox/actions";

describe("inbox actions", () => {
  it("writes explicit kept status with handledAt", async () => {
    await setInboxStatus("h:kept", "kept");
    const state = await getInboxStatus("h:kept");
    expect(state?.status).toBe("kept");
    expect(state?.handledAt).toBeTruthy();
  });

  it("does not set handledAt for pending", async () => {
    await setInboxStatus("h:pending", "pending");
    const state = await getInboxStatus("h:pending");
    expect(state?.status).toBe("pending");
    expect(state?.handledAt).toBeUndefined();
  });

  it("stores snoozedUntil", async () => {
    await setInboxStatus("h:snooze", "snoozed", {
      snoozedUntil: "2026-02-01T00:00:00.000Z",
    });
    const state = await getInboxStatus("h:snooze");
    expect(state?.snoozedUntil).toBe("2026-02-01T00:00:00.000Z");
  });

  it("marks records", async () => {
    await setInboxMark("h:mark", true);
    const states = await listInboxStates();
    expect(states.some((record) => record.recordId === "mark:h:mark")).toBe(
      true,
    );
  });

  it("adds and removes per-edge relations", async () => {
    await addInboxRelation("h:a", "h:b");
    let states = await listInboxStates();
    expect(
      states.some(
        (record) => record.recordId === inboxRelationRecordId("h:a", "h:b"),
      ),
    ).toBe(true);
    await removeInboxRelation("h:a", "h:b");
    states = await listInboxStates();
    expect(
      states.some(
        (record) => record.recordId === inboxRelationRecordId("h:a", "h:b"),
      ),
    ).toBe(false);
  });
});
