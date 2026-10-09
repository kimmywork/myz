import {
  MyZRecord,
  RECORD_KINDS,
  CONTENT_TYPES,
  getRecordKind,
} from "@myz/shared/types";
import { normalizeBadgeCounts, BadgeCount, buildActionTitle } from "../badge";
import { ImportStrategy, normalizeImportStrategy } from "../import";
import { getInboxStatus, setInboxStatus } from "../inbox/actions";
import { buildMarkdownExport } from "../markdown";
import {
  generateId,
  persistHighlightPreferences,
  getHighlightsForUrl,
  saveHighlight,
  getHighlight,
  deleteHighlight,
  getAllHighlights,
  readSettings,
} from "../storage";
import { recordHighlightDeletion } from "../sync/deletions";
import { recordIdForHighlight } from "../sync/records";
import { sendToContentScript } from "../utils/sendToContentScript";
import { registerMessageHandler } from "./handler";
import { mergeImportedRecords } from "./highlights/import-merge";
import {
  applyKindShape,
  buildNewRecord,
  buildUpdatedRecord,
  collectAllTags,
  normalizeIds,
  resolveRequestedUrls,
} from "./highlights/record-helpers";

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

/** Convert record.html to markdown via the page's content script, with a
 * fallback to stripping tags so the record can still be saved. */
async function resolveRecordText(record: MyZRecord, tabId: number | undefined) {
  if (typeof record.html !== "string" || record.html.trim().length === 0) {
    return;
  }
  try {
    const { markdown } = await sendToContentScript<
      { html: string },
      { markdown: string }
    >("myz:convertHtmlToMarkdown", { html: record.html }, tabId);
    record.text = markdown;
    record.contentType = CONTENT_TYPES.MARKDOWN;
  } catch {
    const fallbackText = record.html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    record.text = fallbackText;
    if (fallbackText) record.contentType = CONTENT_TYPES.MARKDOWN;
  }
  delete (record as Record<string, unknown>).html;
}

export function initializeHighlightMessageHandlers() {
  registerMessageHandler(
    "myz:getHighlightsForUrl",
    async (payload: { url?: string; aliases?: string[] }) => {
      const urls = resolveRequestedUrls(payload);
      if (!urls.length) return [];
      const promises = urls.map((url) => getHighlightsForUrl(url));
      const matches = (await Promise.all(promises)).flat();
      return Array.from(new Map(matches.map((m) => [m.id, m])).values());
    },
  );

  registerMessageHandler(
    "myz:saveHighlight",
    async (
      payload: SaveHighlightMessagePayload,
      sender: chrome.runtime.MessageSender,
    ) => {
      if (!payload) throw new Error("Missing highlight payload");
      const now = new Date().toISOString();
      const id = payload.id || generateId();
      const kind = getRecordKind(payload);
      const record = buildNewRecord(payload, now, id, kind);
      await resolveRecordText(record, sender?.tab?.id);
      applyKindShape(record);
      await saveHighlight(record);
      if (kind === RECORD_KINDS.HIGHLIGHT) {
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
      const existing = await getHighlight(payload.id);
      if (!existing) throw new Error("Highlight not found");
      const updated = buildUpdatedRecord(
        existing,
        payload,
        new Date().toISOString(),
      );
      applyKindShape(updated);
      await saveHighlight(updated);
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
      const existing = await getHighlight(payload.id);
      if (!existing) throw new Error("Highlight not found");
      const updated = {
        ...existing,
        range: payload.range,
        updatedAt: new Date().toISOString(),
      } as MyZRecord;
      await saveHighlight(updated);
      return updated;
    },
  );

  registerMessageHandler(
    "myz:removeHighlight",
    async (payload: { id?: string }) => {
      if (!payload?.id) throw new Error("Missing highlight id");
      await recordHighlightDeletion(payload.id);
      await deleteHighlight(payload.id);
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
        await deleteHighlight(id);
      }
      return { removed: unique.length };
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
      const now = new Date().toISOString();
      for (const id of unique) {
        const existing = await getHighlight(id);
        if (!existing) continue;
        const updated: MyZRecord = {
          ...existing,
          note:
            typeof patch.note === "string" ? patch.note.trim() : existing.note,
          tags: Array.isArray(patch.tags) ? patch.tags : existing.tags,
          updatedAt: now,
        };
        await saveHighlight(updated);
      }
      return { updated: unique.length };
    },
  );

  registerMessageHandler("myz:getAllHighlights", async () =>
    getAllHighlights(),
  );

  registerMessageHandler("myz:getAllTags", async () =>
    collectAllTags(await getAllHighlights()),
  );

  registerMessageHandler("myz:export", async () => {
    const highlights = await getAllHighlights();
    return {
      json: JSON.stringify(highlights, null, 2),
      markdown: buildMarkdownExport(highlights),
    };
  });

  registerMessageHandler(
    "myz:updateBadge",
    async (
      payload: { tabId?: number } & Partial<BadgeCount>,
      sender: chrome.runtime.MessageSender,
    ) => {
      const tabId =
        typeof payload?.tabId === "number" ? payload.tabId : sender?.tab?.id;
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
      const list = await getAllHighlights();
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
      replacements.forEach((record) => saves.push(saveHighlight(record)));
      additions.forEach((record) => saves.push(saveHighlight(record)));
      await Promise.all(saves);
      return {
        inserted: additions.size,
        replaced: replacements.size,
        skipped,
      };
    },
  );
}
