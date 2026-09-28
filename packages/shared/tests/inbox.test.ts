import { describe, expect, it } from "vitest";
import {
  inboxMarkRecordId,
  inboxRelationRecordId,
  inboxStatusRecordId,
  isInboxPending,
  parseInboxRecordId,
  resolveInboxStatus,
} from "../src/inbox";

describe("inbox record ids and defaults", () => {
  it("builds and parses the three record kinds", () => {
    expect(inboxStatusRecordId("h:1")).toBe("status:h:1");
    expect(inboxMarkRecordId("h:1")).toBe("mark:h:1");
    expect(inboxRelationRecordId("h:1", "h:2")).toBe("rel:h%3A1:h%3A2");

    expect(parseInboxRecordId("status:h:1")).toEqual({
      kind: "status",
      targetId: "h:1",
    });
    expect(parseInboxRecordId("mark:h:1")).toEqual({
      kind: "mark",
      targetId: "h:1",
    });
    expect(parseInboxRecordId(inboxRelationRecordId("h:1", "h:2"))).toEqual({
      kind: "rel",
      sourceId: "h:1",
      targetId: "h:2",
    });
    expect(parseInboxRecordId("other:x")).toBeNull();
    expect(parseInboxRecordId("rel:noseparator")).toBeNull();
  });

  it("defaults a missing status record to kept (never handled)", () => {
    expect(resolveInboxStatus(null)).toBe("kept");
    expect(isInboxPending(null)).toBe(false);
  });

  it("reports pending and due snoozed records only", () => {
    const now = Date.parse("2026-01-10T00:00:00.000Z");
    expect(
      isInboxPending({ targetId: "h:1", status: "pending", changedAt: "" }, now),
    ).toBe(true);
    expect(
      isInboxPending(
        {
          targetId: "h:1",
          status: "snoozed",
          snoozedUntil: "2026-01-09T00:00:00.000Z",
          changedAt: "",
        },
        now,
      ),
    ).toBe(true);
    expect(
      isInboxPending(
        {
          targetId: "h:1",
          status: "snoozed",
          snoozedUntil: "2026-01-11T00:00:00.000Z",
          changedAt: "",
        },
        now,
      ),
    ).toBe(false);
    expect(
      isInboxPending({ targetId: "h:1", status: "archived", changedAt: "" }, now),
    ).toBe(false);
  });
});
