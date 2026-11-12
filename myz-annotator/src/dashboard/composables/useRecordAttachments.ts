import type { MyZRecord } from "@myz/shared/types";
import { shallowRef } from "vue";
import type { Ref } from "vue";
import { invoke } from "@/messaging/invoke.js";
import type { StagedAssetSummary } from "@/stitch/staged-asset.js";

/** What a record card needs to draw its attachment. */
export interface RecordAttachmentView {
  thumb: string;
  /** Badge text: 图片 / 视频帧 / 截图. */
  kindLabel: string;
  /** `mm:ss` for a video frame, empty otherwise. */
  timeLabel: string;
}

const KIND_LABELS: Record<string, string> = {
  image: "图片",
  "video-frame": "视频帧",
  screenshot: "截图",
};

function timeLabel(summary: StagedAssetSummary): string {
  const seconds = summary.timeSeconds;
  if (typeof seconds !== "number" || seconds < 0) return "";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function toView(summary: StagedAssetSummary): RecordAttachmentView {
  return {
    thumb: summary.thumb,
    kindLabel: KIND_LABELS[summary.sourceKind] ?? "图片",
    timeLabel: timeLabel(summary),
  };
}

/**
 * Attachment thumbnails for record cards (§I7).
 *
 * A record only stores `assetId`, so the card needs the capture cache to draw
 * anything. Summaries are fetched once per batch of ids and cached: the list
 * re-renders on every filter change and must not refetch each time. An id that
 * is not on this device (records synced from elsewhere) simply stays absent,
 * and the card shows the "图片在本机" placeholder.
 */
export function useRecordAttachments(): {
  views: Ref<Map<string, RecordAttachmentView>>;
  /** Fetches summaries for any ids not already cached. */
  ensure: (records: readonly MyZRecord[]) => Promise<void>;
} {
  const views = shallowRef(new Map<string, RecordAttachmentView>());
  const requested = new Set<string>();

  async function ensure(records: readonly MyZRecord[]) {
    const missing: string[] = [];
    for (const record of records) {
      const assetId = record.attachments?.[0]?.assetId;
      if (!assetId || requested.has(assetId)) continue;
      requested.add(assetId);
      missing.push(assetId);
    }
    if (!missing.length) return;

    let summaries: StagedAssetSummary[] = [];
    try {
      summaries = await invoke("myz:getStagedAssetSummaries", { ids: missing });
    } catch (error) {
      console.warn("Failed to load attachment thumbnails", error);
      // Allow a later render to retry these ids.
      missing.forEach((id) => requested.delete(id));
      return;
    }

    const next = new Map(views.value);
    summaries.forEach((summary) => next.set(summary.id, toView(summary)));
    views.value = next;
  }

  return { views, ensure };
}
