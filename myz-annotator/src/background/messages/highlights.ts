import { normalizeHighlightStyle } from "@myz/shared/highlightUtils";
import {
  MyZRecord,
  RECORD_KINDS,
  CONTENT_TYPES,
  ensureRecordSchemaVersion,
  getRecordKind,
  resolveRecordContentType,
} from "@myz/shared/types";
import { normalizeBadgeCounts, BadgeCount, buildActionTitle } from "../badge";
import {
  ImportStrategy,
  normalizeImportStrategy,
  sanitizeImportedHighlight,
  resolveImportConflict,
  buildRecordSignature,
  applyTimestampFallback,
} from "../import";
import { buildMarkdownExport } from "../markdown";
import {
  generateId,
  persistHighlightPreferences,
  generateUniqueImportId,
  getHighlightsForUrl,
  saveHighlight,
  getHighlight,
  deleteHighlight,
  getAllHighlights,
} from "../storage";
import { recordHighlightDeletion } from "../sync/deletions";
import { sendToContentScript } from "../utils/sendToContentScript";
import { registerMessageHandler } from "./handler";

export function normalizeIds(ids?: unknown): string[] {
  const list = Array.isArray(ids) ? ids : [];
  return Array.from(
    new Set(
      list
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter(Boolean),
    ),
  );
}

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

export function initializeHighlightMessageHandlers() {
  registerMessageHandler(
    "myz:getHighlightsForUrl",
    async (payload: { url?: string; aliases?: string[] }) => {
      const urls = new Set<string>();
      if (typeof payload?.url === "string" && payload.url) {
        urls.add(payload.url);
      }
      if (Array.isArray(payload?.aliases)) {
        payload.aliases.forEach((candidate) => {
          if (typeof candidate === "string" && candidate) {
            urls.add(candidate);
          }
        });
      }
      if (!urls.size) {
        return [];
      }

      const promises = Array.from(urls).map((url) => getHighlightsForUrl(url));
      const results = await Promise.all(promises);
      const matches = results.flat();

      const uniqueMatches = Array.from(
        new Map(matches.map((m) => [m.id, m])).values(),
      );

      return uniqueMatches;
    },
  );

  registerMessageHandler(
    "myz:saveHighlight",
    async (
      payload: SaveHighlightMessagePayload,
      sender: chrome.runtime.MessageSender,
    ) => {
      if (!payload) {
        throw new Error("Missing highlight payload");
      }
      const now = new Date().toISOString();
      const id = payload.id || generateId();
      const kind = getRecordKind(payload);
      const record: MyZRecord = ensureRecordSchemaVersion({
        ...payload,
        id,
        kind,
        createdAt: payload.createdAt || now,
        updatedAt: now,
      }) as MyZRecord;
      record.contentType = resolveRecordContentType(record);

      if (typeof record.html === "string" && record.html.trim().length > 0) {
        const tabId = sender?.tab?.id;
        const { markdown } = await sendToContentScript<
          { html: string },
          { markdown: string }
        >("myz:convertHtmlToMarkdown", { html: record.html }, tabId);
        record.text = markdown;
        record.contentType = CONTENT_TYPES.MARKDOWN;
        delete (record as Record<string, unknown>).html;
      }

      if (kind !== RECORD_KINDS.HIGHLIGHT) {
        record.range = undefined;
        record.color = undefined;
        record.style = undefined;
      } else {
        record.style = normalizeHighlightStyle(payload.style);
      }

      await saveHighlight(record);

      if (kind === RECORD_KINDS.HIGHLIGHT) {
        await persistHighlightPreferences({
          color: record.color,
          style: record.style,
        });
      }
      return record;
    },
  );

  registerMessageHandler(
    "myz:updateHighlight",
    async (payload: Partial<MyZRecord>) => {
      if (!payload?.id) {
        throw new Error("Missing highlight id");
      }
      const existing = await getHighlight(payload.id);
      if (!existing) {
        throw new Error("Highlight not found");
      }
      const now = new Date().toISOString();
      const requestedKind =
        typeof payload.kind === "string" &&
        Object.values(RECORD_KINDS).includes(payload.kind as RECORD_KINDS)
          ? (payload.kind as RECORD_KINDS)
          : existing.kind;
      const updated: MyZRecord = ensureRecordSchemaVersion({
        ...existing,
        ...payload,
        kind: requestedKind,
        updatedAt: now,
      }) as MyZRecord;
      updated.contentType = resolveRecordContentType(updated);
      if (updated.kind !== RECORD_KINDS.HIGHLIGHT) {
        updated.range = undefined;
        updated.color = undefined;
        updated.style = undefined;
      } else {
        updated.style = normalizeHighlightStyle(updated.style);
      }
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
    "myz:removeHighlight",
    async (payload: { id?: string }) => {
      if (!payload?.id) {
        throw new Error("Missing highlight id");
      }
      await recordHighlightDeletion(payload.id);
      await deleteHighlight(payload.id);
      return { success: true };
    },
  );

  registerMessageHandler(
    "myz:removeRecordsByIds",
    async (payload: { ids?: string[] }) => {
      const unique = normalizeIds(payload?.ids);
      if (!unique.length) {
        return { removed: 0 };
      }
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
      if (!unique.length) {
        return { updated: 0 };
      }
      const now = new Date().toISOString();
      for (const id of unique) {
        const existing = await getHighlight(id);
        if (!existing) {
          continue;
        }
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

  registerMessageHandler("myz:getAllHighlights", async () => {
    const highlights = await getAllHighlights();
    return highlights;
  });

  registerMessageHandler("myz:getAllTags", async () => {
    const highlights = await getAllHighlights();
    const tags = new Set<string>();
    highlights.forEach((item) => {
      if (!item || !Array.isArray(item.tags)) {
        return;
      }
      item.tags.forEach((tag) => {
        if (typeof tag !== "string") {
          return;
        }
        const normalized = tag.trim();
        if (!normalized) {
          return;
        }
        tags.add(normalized);
      });
    });
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  });

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
      if (!records.length) {
        throw new Error("没有可导入的数据");
      }

      const strategy = normalizeImportStrategy(payload?.strategy);
      const existingHighlightsList = await getAllHighlights();
      const existingHighlights: Record<string, MyZRecord> = {};
      existingHighlightsList.forEach((h) => (existingHighlights[h.id] = h));
      const usedIds = new Set(Object.keys(existingHighlights));

      const existingSignatures = new Set();
      Object.values(existingHighlights).forEach((record) => {
        const signature = buildRecordSignature(record);
        if (signature) {
          existingSignatures.add(signature);
        }
      });

      const replacements: Map<string, MyZRecord> = new Map();
      const additions: Map<string, MyZRecord> = new Map();
      let skipped = 0;

      records.forEach((raw) => {
        const sanitized = sanitizeImportedHighlight(raw);
        if (!sanitized) {
          skipped += 1;
          return;
        }

        let identifier =
          typeof sanitized.id === "string" ? sanitized.id.trim() : "";

        // Handle conflicts with existing highlights first.
        if (
          identifier &&
          existingHighlights[identifier] &&
          !replacements.has(identifier)
        ) {
          const existingRecord = existingHighlights[identifier];
          if (!resolveImportConflict(strategy, existingRecord, sanitized)) {
            skipped += 1;
            return;
          }
          sanitized.id = identifier;
          applyTimestampFallback(sanitized, existingRecord);
          const signature = buildRecordSignature(sanitized);
          if (signature) {
            existingSignatures.add(signature);
          }
          replacements.set(identifier, sanitized);
          return;
        }

        // Conflicts with already staged replacements or additions (duplicate IDs within payload).
        if (
          identifier &&
          (replacements.has(identifier) || additions.has(identifier))
        ) {
          const staged = (replacements.get(identifier) ||
            additions.get(identifier))!;
          if (!resolveImportConflict(strategy, staged, sanitized)) {
            skipped += 1;
            return;
          }
          sanitized.id = identifier;
          applyTimestampFallback(sanitized, staged);
          const signature = buildRecordSignature(sanitized);
          if (signature) {
            existingSignatures.add(signature);
          }
          if (replacements.has(identifier)) {
            replacements.set(identifier, sanitized);
          } else {
            additions.set(identifier, sanitized);
          }
          return;
        }

        // De-duplicate by record signature to avoid creating duplicates.
        const signature = buildRecordSignature(sanitized);
        if (signature && existingSignatures.has(signature)) {
          skipped += 1;
          return;
        }

        let resolvedId = identifier;
        if (
          !resolvedId ||
          usedIds.has(resolvedId) ||
          additions.has(resolvedId)
        ) {
          resolvedId = generateUniqueImportId(usedIds);
        } else {
          usedIds.add(resolvedId);
        }
        sanitized.id = resolvedId;
        applyTimestampFallback(sanitized);
        sanitized.updatedAt = sanitized.updatedAt || sanitized.createdAt;
        if (signature) {
          existingSignatures.add(signature);
        }
        additions.set(resolvedId, sanitized);
      });

      if (!additions.size && !replacements.size && skipped === 0) {
        throw new Error("没有符合要求的标注");
      }

      const savePromises: Promise<void>[] = [];
      replacements.forEach((record) =>
        savePromises.push(saveHighlight(record)),
      );
      additions.forEach((record) => savePromises.push(saveHighlight(record)));
      await Promise.all(savePromises);

      return {
        inserted: additions.size,
        replaced: replacements.size,
        skipped,
      };
    },
  );
}
