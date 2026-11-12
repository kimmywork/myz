import type { StagedAssetMeta } from "@myz/core/staged-asset";
import { RECORD_KINDS } from "@myz/shared/types";
import type { MyZRecord, RecordAttachment } from "@myz/shared/types";

/** What a capture becomes when the user turns it into a record. */
export type AssetRecordPayload = Partial<MyZRecord>;

/** Context fields that several captures may share (§I7). */
interface SharedContext {
  pageUrl?: string;
  pageTitle?: string;
  text?: string;
}

function hostnameOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname || undefined;
  } catch {
    return undefined;
  }
}

/** A readable fallback URL for a capture with no host page. */
function fallbackUrl(asset: StagedAssetMeta): string {
  return asset.context?.pageUrl || asset.sourceUrl || `myz-asset:${asset.id}`;
}

/**
 * Fields every capture in the batch agrees on.
 *
 * The contract asks for "the shared part, gaps stay empty, no per-item
 * fill-in": when captures came from different pages the batch must not pretend
 * they share one.
 */
export function sharedContext(
  assets: readonly StagedAssetMeta[],
): SharedContext {
  const first = assets[0]?.context;
  if (!first) return {};
  const same = (pick: (asset: StagedAssetMeta) => string | undefined) => {
    const values = assets.map(pick);
    const [head] = values;
    return head && values.every((value) => value === head) ? head : undefined;
  };
  return {
    pageUrl: same((asset) => asset.context?.pageUrl),
    pageTitle: same((asset) => asset.context?.pageTitle),
    text: same((asset) => asset.context?.text),
  };
}

/**
 * Turns captures into record payloads (§I7).
 *
 * One record per capture, each carrying a single attachment reference. Text
 * and source come from the batch's shared context; anything the captures do
 * not agree on stays empty rather than borrowing a neighbour's value.
 */
export function buildAssetRecords(
  assets: readonly StagedAssetMeta[],
): AssetRecordPayload[] {
  if (!assets.length) return [];
  const shared = assets.length > 1 ? sharedContext(assets) : {};

  return assets.map((asset) => {
    const context = asset.context;
    const text =
      (assets.length > 1 ? shared.text : context?.text) || asset.name;
    const pageUrl =
      (assets.length > 1 ? shared.pageUrl : context?.pageUrl) ||
      asset.context?.pageUrl ||
      asset.sourceUrl;
    const pageTitle =
      (assets.length > 1 ? shared.pageTitle : context?.pageTitle) || undefined;
    // A video record should open at the captured frame, not at the start.
    const deepLink =
      asset.sourceKind === "video-frame" ? videoDeepLink(asset) : undefined;
    const url = deepLink || pageUrl || fallbackUrl(asset);
    const hostname = hostnameOf(pageUrl);

    const payload: AssetRecordPayload = {
      kind: RECORD_KINDS.CLIP,
      text,
      url,
      title: pageTitle || asset.name,
      attachments: [
        {
          assetId: asset.id,
          mime: asset.mime,
          width: asset.width,
          height: asset.height,
        },
      ],
    };
    if (pageUrl) payload.sourceUrl = pageUrl;
    if (hostname) payload.hostname = hostname;
    return payload;
  });
}

/** `mm:ss` for a video frame, or an empty string when it is not one. */
export function videoTimeLabel(asset: StagedAssetMeta): string {
  const seconds = asset.context?.timeSeconds;
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) {
    return "";
  }
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

/**
 * The source URL with `?t=` pointing at the captured frame, so opening the
 * record lands on that moment of the video.
 */
export function videoDeepLink(asset: StagedAssetMeta): string | undefined {
  const seconds = asset.context?.timeSeconds;
  const base = asset.context?.pageUrl || asset.sourceUrl;
  if (typeof seconds !== "number" || !base) return undefined;
  try {
    const url = new URL(base);
    url.searchParams.set("t", `${Math.floor(seconds)}s`);
    return url.toString();
  } catch {
    return undefined;
  }
}

/** The attachment an asset card shows: the first one only (§I7). */
export function firstAttachment(
  record: Pick<MyZRecord, "attachments">,
): RecordAttachment | undefined {
  return record.attachments?.[0];
}
