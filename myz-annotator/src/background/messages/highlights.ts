import {
  createRecord,
  getRecordsForUrls,
  listRecords,
  listTags,
  normalizeIds,
  removeRecord,
  removeRecords,
  resolveRequestedUrls,
  updateRecord,
  updateRecordRange,
  updateRecordsPatch,
} from "@myz/core/services/records";
import type { MessageContext } from "@myz/shared/messageRegistry";
import { MyZRecord, RECORD_KINDS } from "@myz/shared/types";
import { normalizeBadgeCounts, BadgeCount, buildActionTitle } from "../badge";
import { ImportStrategy, normalizeImportStrategy } from "../import";
import { getInboxStatus, setInboxStatus } from "../inbox/actions";
import { buildMarkdownExport } from "../markdown";
import {
  generateId,
  persistHighlightPreferences,
  readSettings,
} from "../storage";
import { recordsStore } from "../stores";
import { recordHighlightDeletion } from "../sync/deletions";
import { recordIdForHighlight } from "../sync/records";
import { sendToContentScript } from "../utils/sendToContentScript";
import { registerMessageHandler } from "./handler";
import { mergeImportedRecords } from "./highlights/import-merge";

export { normalizeIds };

export type GetHighlightsForUrlMessageResult = MyZRecord[];
export type SaveHighlightMessageResult = MyZRecord;
export type SaveHighlightMessagePayload = Partial<MyZRecord>;
export type UpdateHighlightMessageResult = MyZRecord;
export interface RemoveHighlightMessageResult {
  success: boolean;
}
export interface RemoveRecordsByIdsMessageResult {
  removed: number;
}
export interface UpdateRecordsByIdsMessageResult {
  updated: number;
}
export type GetAllHighlightsMessageResult = MyZRecord[];
export type GetAllTagsMessageResult = string[];

/** The host's HTML→Markdown capability, wired to the page's content script. */
function htmlToMarkdown(html: string, tabId?: number): Promise<string> {
  return sendToContentScript<{ html: string }, { markdown: string }>(
    "myz:convertHtmlToMarkdown",
    { html },
    tabId,
  ).then((result) => result.markdown);
}

export function initializeHighlightMessageHandlers() {
  registerMessageHandler(
    "myz:getHighlightsForUrl",
    async (payload: { url?: string; aliases?: string[] }) => {
      const urls = resolveRequestedUrls(payload);
      if (!urls.length) return [];
      return getRecordsForUrls(recordsStore, urls);
    },
  );

  registerMessageHandler(
    "myz:saveHighlight",
    async (payload: SaveHighlightMessagePayload, ctx: MessageContext) => {
      if (!payload) throw new Error("Missing highlight payload");
      const record = await createRecord(recordsStore, payload, {
        newId: generateId,
        tabId: ctx.tabId,
        htmlToMarkdown,
      });
      if (record.kind === RECORD_KINDS.HIGHLIGHT) {
        await persistHighlightPreferences({
          color: record.color,
          style: record.style,
        });
      }
      const settings = await readSettings();
      if (settings.inboxEnabled !== false) {
        const targetId = recordIdForHighlight(record.id);
        const existing = await getInboxStatus(targetId);
        if (!existing) await setInboxStatus(targetId, "pending");
      }
      return record;
    },
  );

  registerMessageHandler(
    "myz:updateHighlight",
    async (payload: Partial<MyZRecord>) => {
      if (!payload?.id) throw new Error("Missing highlight id");
      const updated = await updateRecord(recordsStore, payload.id, payload);
      if (updated.kind === RECORD_KINDS.HIGHLIGHT) {
        await persistHighlightPreferences({
          color: updated.color,
          style: updated.style,
        });
      }
      return updated;
    },
  );

  registerMessageHandler(
    "myz:updateHighlightRange",
    async (payload: { id?: string; range?: MyZRecord["range"] }) => {
      if (!payload?.id || !payload.range) {
        throw new Error("Missing highlight id or range");
      }
      return updateRecordRange(recordsStore, payload.id, payload.range);
    },
  );

  registerMessageHandler(
    "myz:removeHighlight",
    async (payload: { id?: string }) => {
      if (!payload?.id) throw new Error("Missing highlight id");
      await recordHighlightDeletion(payload.id);
      await removeRecord(recordsStore, payload.id);
      return { success: true };
    },
  );

  registerMessageHandler(
    "myz:removeRecordsByIds",
    async (payload: { ids?: string[] }) => {
      const unique = normalizeIds(payload?.ids);
      if (!unique.length) return { removed: 0 };
      for (const id of unique) {
        await recordHighlightDeletion(id);
      }
      return { removed: await removeRecords(recordsStore, unique) };
    },
  );

  registerMessageHandler(
    "myz:updateRecordsByIds",
    async (payload: { ids?: string[]; patch?: Partial<MyZRecord> }) => {
      const unique = normalizeIds(payload?.ids);
      const patch =
        payload?.patch && typeof payload.patch === "object"
          ? payload.patch
          : {};
      if (!unique.length) return { updated: 0 };
      return { updated: await updateRecordsPatch(recordsStore, unique, patch) };
    },
  );

  registerMessageHandler("myz:getAllHighlights", async () =>
    listRecords(recordsStore),
  );

  registerMessageHandler("myz:getAllTags", async () => listTags(recordsStore));

  registerMessageHandler("myz:export", async () => {
    const highlights = await listRecords(recordsStore);
    return {
      json: JSON.stringify(highlights, null, 2),
      markdown: buildMarkdownExport(highlights),
    };
  });

  registerMessageHandler(
    "myz:updateBadge",
    async (
      payload: { tabId?: number } & Partial<BadgeCount>,
      ctx: MessageContext,
    ) => {
      const tabId =
        typeof payload?.tabId === "number" ? payload.tabId : ctx.tabId;
      if (typeof tabId !== "number" || Number.isNaN(tabId)) {
        return { success: false };
      }
      const { total, highlightCount, savedCount } =
        normalizeBadgeCounts(payload);
      const text = total > 0 ? (total > 99 ? "99+" : String(total)) : "";
      await chrome.action.setBadgeText({ tabId, text });
      if (text) {
        await chrome.action.setBadgeBackgroundColor({
          tabId,
          color: [37, 99, 235, 255],
        });
        if (typeof chrome.action.setBadgeTextColor === "function") {
          await chrome.action.setBadgeTextColor({
            tabId,
            color: [255, 255, 255, 255],
          });
        }
      }
      const title = buildActionTitle({ total, highlightCount, savedCount });
      try {
        await chrome.action.setTitle({ tabId, title });
      } catch (error) {
        console.warn("Failed to update action title", error);
      }
      return { success: true };
    },
  );

  registerMessageHandler(
    "myz:importHighlights",
    async (payload: { records?: MyZRecord[]; strategy?: ImportStrategy }) => {
      const records = Array.isArray(payload?.records) ? payload.records : [];
      if (!records.length) throw new Error("没有可导入的数据");
      const strategy = normalizeImportStrategy(payload?.strategy);
      const list = await listRecords(recordsStore);
      const existingHighlights: Record<string, MyZRecord> = {};
      list.forEach((h) => (existingHighlights[h.id] = h));

      const { replacements, additions, skipped } = mergeImportedRecords(
        existingHighlights,
        records,
        strategy,
      );
      if (!additions.size && !replacements.size && skipped === 0) {
        throw new Error("没有符合要求的记录");
      }
      const saves: Promise<void>[] = [];
      replacements.forEach((record) => saves.push(recordsStore.upsert(record)));
      additions.forEach((record) => saves.push(recordsStore.upsert(record)));
      await Promise.all(saves);
      return {
        inserted: additions.size,
        replaced: replacements.size,
        skipped,
      };
    },
  );
}
