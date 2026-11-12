/**
 * Snapshot message handlers (§I8).
 *
 * The content script extracts the body (it has the live DOM); the background
 * owns the store, the quota and eviction. Failures travel back as `ok: false`
 * with a message, never as a silent success: a snapshot the user believes in
 * but does not have is the one outcome this feature must not produce.
 */
import { snapshotStatusLine } from "@myz/core/page-snapshot";
import {
  SnapshotWriteError,
  getSnapshotForRecord,
  getSnapshotVersions,
  saveSnapshot,
  shouldAnnounceEviction,
  snapshotUsageBytes,
  touchSnapshot,
} from "../snapshots.js";
import { registerMessageHandler } from "./handler.js";

export function initializeSnapshotMessageHandlers() {
  registerMessageHandler("myz:saveSnapshot", async (payload) => {
    if (!payload?.url || typeof payload.html !== "string" || !payload.html) {
      return { ok: false, error: "页面正文为空，无法保存快照" };
    }
    try {
      const { saved, evicted } = await saveSnapshot({
        id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        recordId: payload.recordId,
        url: payload.url,
        title: payload.title || payload.url,
        html: payload.html,
        css: payload.css,
        // Size is measured inside the store; the payload's value is advisory.
      });
      return {
        ok: true,
        id: saved.id,
        evicted,
        // The user is told once per session, not on every eviction.
        announceEviction: evicted.length > 0 && shouldAnnounceEviction(),
      };
    } catch (error) {
      if (error instanceof SnapshotWriteError) {
        return { ok: false, error: error.message };
      }
      return { ok: false, error: `快照保存失败：${(error as Error).message}` };
    }
  });

  registerMessageHandler("myz:getSnapshotForRecord", async (payload) => {
    const snapshot = await getSnapshotForRecord(payload.recordId);
    if (!snapshot) return null;
    // Reading a snapshot is a use, so LRU keeps what the user actually opens.
    await touchSnapshot(snapshot.id);
    return snapshot;
  });

  registerMessageHandler("myz:getSnapshotVersions", async (payload) => {
    if (!payload?.url) return [];
    return getSnapshotVersions(payload.url);
  });

  registerMessageHandler("myz:getSnapshotUsage", async () => {
    const bytes = await snapshotUsageBytes();
    return { bytes, statusLine: snapshotStatusLine(bytes) };
  });
}
