/**
 * Typed message contracts for the extension's two transport channels.
 *
 * - `MyzRuntimeMap` — UI / content script / popup / readers → background
 *   service worker (`chrome.runtime.sendMessage`), handled by the background
 *   registry (`background/messages/handler.ts`).
 * - `MyzTabMap` — background / popup → a content script in a tab
 *   (`chrome.tabs.sendMessage`), handled by the content registry
 *   (`content/messages/handler.ts`).
 *
 * Message keys are host-internal and never a cross-host wire protocol: the
 * cross-host discriminator is the record `schemaId` (see
 * `docs/plan/core-refactor.md`). This file is the single source of truth for
 * both the sender and the handler side.
 */
import type { ImportStrategy } from "@myz/core/import";
import type {
  InboxMarkState,
  InboxRelationState,
  InboxStatus,
  InboxStatusState,
} from "@myz/shared/inbox";
import type { MyZRecord } from "@myz/shared/types";
import type { SyncS3Settings, SyncSettings } from "@myz/sync-core/settings";
import type { BadgeCount } from "@/background/badge.js";
import type { InboxQueueResult } from "@/background/inbox/queue.js";
import type {
  AccountStatusMessageResult,
  SyncNowMessageResult,
  SyncSetKeyMessageResult,
  SyncStatusMessageResult,
  SyncTestConnectionMessageResult,
} from "@/background/messages/sync/types.js";
import type { PublicSettings } from "@/background/settings-public.js";
import type { Settings } from "@/background/settings.js";
import type { InboxStateRecord } from "@/background/storage.js";
import type { LegacyMigrationResult } from "@/background/sync/v2/bootstrap.js";
import type { acceptPairingInvite } from "@/background/sync/v2/pairingSession.js";
import type {
  NewStagedAsset,
  StagedAsset,
  StagedAssetMeta,
} from "@/stitch/staged-asset.js";

/** Snapshot returned by `myz:getHighlightState`. */
export interface HighlightStateSnapshot {
  count: number;
  total: number;
  highlightCount: number;
  savedCount: number;
  unreachableIds: string[];
  unreachableCount: number;
}

/** Step-2 pairing response (SAS + any non-sensitive S3 prefill). */
type PairingAcceptResult = Awaited<ReturnType<typeof acceptPairingInvite>>;

/**
 * UI / content script / popup / readers → background channel.
 * Handled by the background message registry.
 */
export type MyzRuntimeMap = {
  // ── Highlights / records ────────────────────────────────────────────────
  "myz:getHighlightsForUrl": {
    payload: { url?: string; aliases?: string[] };
    result: MyZRecord[];
  };
  "myz:saveHighlight": { payload: Partial<MyZRecord>; result: MyZRecord };
  "myz:updateHighlight": { payload: Partial<MyZRecord>; result: MyZRecord };
  "myz:updateHighlightRange": {
    payload: { id?: string; range?: MyZRecord["range"] };
    result: MyZRecord;
  };
  "myz:removeHighlight": {
    payload: { id?: string };
    result: { success: boolean };
  };
  "myz:removeRecordsByIds": {
    payload: { ids?: string[] };
    result: { removed: number };
  };
  "myz:updateRecordsByIds": {
    payload: { ids?: string[]; patch?: Partial<MyZRecord> };
    result: { updated: number };
  };
  "myz:getAllHighlights": { payload: void; result: MyZRecord[] };
  "myz:getAllTags": { payload: void; result: string[] };
  "myz:export": { payload: void; result: { json: string; markdown: string } };
  "myz:updateBadge": {
    payload: { tabId?: number; count?: number } & Partial<BadgeCount>;
    result: { success: boolean };
  };
  "myz:importHighlights": {
    payload: { records?: MyZRecord[]; strategy?: ImportStrategy };
    result: { inserted: number; replaced: number; skipped: number };
  };

  // ── Settings ────────────────────────────────────────────────────────────
  "myz:getSettings": { payload: void; result: Settings };
  "myz:getPublicSettings": { payload: void; result: PublicSettings };
  "myz:updateSettings": { payload: Partial<Settings>; result: Settings };
  "myz:updatePalette": { payload: Partial<Settings>; result: Settings };
  "myz:updateHighlightPreference": {
    payload: Partial<Settings>;
    result: PublicSettings;
  };

  // ── Inbox ───────────────────────────────────────────────────────────────
  "myz:inboxSetStatus": {
    payload: { targetId: string; status: InboxStatus; snoozedUntil?: string };
    result: InboxStatusState;
  };
  "myz:inboxGetStatus": {
    payload: { targetId: string };
    result: InboxStatusState | null;
  };
  "myz:inboxSetMark": {
    payload: { targetId: string; marked: boolean };
    result: InboxMarkState;
  };
  "myz:inboxAddRelation": {
    payload: { sourceId: string; targetId: string };
    result: InboxRelationState;
  };
  "myz:inboxRemoveRelation": {
    payload: { sourceId: string; targetId: string };
    result: { ok: boolean };
  };
  "myz:inboxListStates": { payload: void; result: InboxStateRecord[] };
  "myz:inboxQueue": { payload: void; result: InboxQueueResult };

  // ── Search ──────────────────────────────────────────────────────────────
  "myz:search": { payload: { query: string }; result: { ok: boolean } };

  // ── Capture cache (staged assets) ───────────────────────────────────────
  "myz:stageAsset": {
    payload: Partial<NewStagedAsset> | undefined;
    result: { id: string };
  };
  "myz:listStagedAssets": { payload: void; result: StagedAssetMeta[] };
  "myz:getStagedAsset": {
    payload: { id?: string } | undefined;
    result: StagedAsset | null;
  };
  "myz:deleteStagedAsset": {
    payload: { id?: string } | undefined;
    result: { ok: boolean };
  };
  "myz:clearStagedAssets": { payload: void; result: { ok: boolean } };

  // ── Page/media capture ──────────────────────────────────────────────────
  "myz:captureSelection": {
    payload: { format?: "jpeg" | "png"; quality?: number };
    result: { dataUrl: string };
  };
  "myz:fetchAsset": {
    payload: { url?: string } | undefined;
    result: { dataUrl: string; mime: string };
  };

  // ── Sync / account / pairing ────────────────────────────────────────────
  "myz:syncUpdateSettings": {
    payload: { enabled?: boolean; s3?: Partial<SyncS3Settings> };
    result: { sync: SyncSettings };
  };
  "myz:syncTestConnection": {
    payload: { s3?: Partial<SyncS3Settings> } | undefined;
    result: SyncTestConnectionMessageResult;
  };
  "myz:syncSetKey": {
    payload: { secret: string; userGesture?: boolean };
    result: SyncSetKeyMessageResult;
  };
  "myz:syncClearKey": {
    payload: { userGesture?: boolean };
    result: SyncNowMessageResult;
  };
  "myz:syncNow": { payload: void; result: SyncNowMessageResult };
  "myz:syncStatus": { payload: void; result: SyncStatusMessageResult };
  "myz:accountStatus": { payload: void; result: AccountStatusMessageResult };
  "myz:accountCreate": {
    payload: { userGesture?: boolean };
    result: {
      accountId: string;
      deviceId: string;
      epoch: number;
      roster: string;
    };
  };
  "myz:accountMigrateLegacy": {
    payload: {
      secret?: string;
      s3?: Partial<SyncS3Settings>;
      userGesture?: boolean;
    };
    result: LegacyMigrationResult;
  };
  "myz:accountImport": {
    payload: { roster: string; userGesture?: boolean };
    result: { accountId: string; deviceId: string; epoch: number };
  };
  "myz:accountClear": {
    payload: { userGesture?: boolean };
    result: SyncNowMessageResult;
  };
  "myz:accountBootstrap": {
    payload: { rescue?: boolean; userGesture?: boolean };
    result: { accountId: string; rescued: number };
  };
  "myz:pairingInvite": {
    payload: { userGesture?: boolean };
    result: { offer: string };
  };
  "myz:pairingAccept": {
    payload: { invite: string; userGesture?: boolean };
    result: PairingAcceptResult;
  };
  "myz:pairingApprove": {
    payload: { response: string; userGesture?: boolean };
    result: { sas: string; roster: string };
  };

  // ── Notifications (no handler; fire-and-forget) ─────────────────────────
  "myz:zenModeStateChanged": { payload: void; result: void };
};

/**
 * Background / popup → content-script-in-a-tab channel.
 * Handled by the content message registry.
 */
export type MyzTabMap = {
  "myz:scrollToHighlight": {
    payload: { id: string };
    result: { success: boolean };
  };
  "myz:refreshHighlights": { payload: void; result: void };
  "myz:getHighlightState": { payload: void; result: HighlightStateSnapshot };
  "myz:convertHtmlToMarkdown": {
    payload: { html?: string };
    result: { markdown: string };
  };
  "myz:canEnterZenMode": { payload: void; result: { canEnter: boolean } };
  "myz:getZenModeState": { payload: void; result: { enabled: boolean } };
  "myz:toggleZenMode": { payload: void; result: { state: string } };
  "myz:captureZenTargetFull": { payload: void; result: void };
  "myz:capturePageImage": {
    payload: { srcUrl?: string } | undefined;
    result: { ok: boolean };
  };
  "myz:captureVideoFrame": {
    payload: { srcUrl?: string } | undefined;
    result: { ok: boolean };
  };
};

export type MyzRuntimeType = keyof MyzRuntimeMap;
export type MyzTabType = keyof MyzTabMap;
