import { serializeRange } from "@myz/shared/serializer";
import {
  CONTENT_TYPES,
  HIGHLIGHT_STYLES,
  RECORD_KINDS,
  type MyZRecord,
} from "@myz/shared/types";
import type { ComputedRef, Ref } from "vue";
import { applyHighlights, type EpubHighlightRecord } from "../highlights.js";
import { invoke } from "@/messaging/invoke";

interface HighlightDeps {
  records: Ref<MyZRecord[]>;
  sourceKey: ComputedRef<string>;
  title: ComputedRef<string>;
  spineIndex: Ref<number>;
  progression: Ref<number>;
  lastColor: Ref<string>;
  lastStyle: Ref<HIGHLIGHT_STYLES>;
}

/** Load / create / patch / delete EPUB highlights and repaint the chapter. */
export function createEpubHighlights(deps: HighlightDeps) {
  async function loadRecords() {
    if (!deps.sourceKey.value) {
      deps.records.value = [];
      return;
    }
    try {
      const list = await invoke("myz:getHighlightsForUrl", {
        url: deps.sourceKey.value,
        aliases: [deps.sourceKey.value],
      });
      deps.records.value = Array.isArray(list) ? (list as MyZRecord[]) : [];
    } catch {
      deps.records.value = [];
    }
  }

  /** Paints the stored highlights onto the currently rendered chapter. */
  function applyCurrentChapter(doc: Document): number {
    return applyHighlights(
      doc,
      deps.records.value as EpubHighlightRecord[],
      deps.spineIndex.value,
    );
  }

  function repaint(doc: Document | null) {
    if (doc) applyCurrentChapter(doc);
  }

  async function createHighlight(range: Range, kind: RECORD_KINDS) {
    const text = range.toString().trim();
    if (!text || !deps.sourceKey.value) return;
    const payload: Partial<MyZRecord> = {
      url: deps.sourceKey.value,
      sourceUrl: deps.sourceKey.value,
      title: deps.title.value,
      text,
      html: "",
      note: "",
      tags: [],
      hostname: "",
      kind,
      contentType: CONTENT_TYPES.PLAIN,
      epubLocator: {
        spineIndex: deps.spineIndex.value,
        progression: deps.progression.value,
        textQuote: text,
      },
    };
    if (kind === RECORD_KINDS.HIGHLIGHT) {
      payload.color = deps.lastColor.value;
      payload.style = deps.lastStyle.value;
      // `serializeRange` unwraps existing marks first so paths index the
      // original DOM; we repaint from `records` afterwards.
      payload.range = serializeRange(range, new Map(), () => {}) ?? undefined;
    }
    try {
      const saved = await invoke("myz:saveHighlight", payload);
      if (saved) deps.records.value = [...deps.records.value, saved];
    } catch (error) {
      console.warn("Failed to save EPUB highlight", error);
    } finally {
      // `serializeRange` unwrapped every existing mark before the round-trip;
      // repaint from `records` so a failed save cannot leave the chapter bare.
      repaint(range.startContainer.ownerDocument);
    }
  }

  async function deleteRecord(id: string) {
    await invoke("myz:removeHighlight", { id });
    deps.records.value = deps.records.value.filter(
      (record) => record.id !== id,
    );
  }

  function getRecord(id: string): MyZRecord | undefined {
    return deps.records.value.find((record) => record.id === id);
  }

  /** Patch note/tags/colour/style on an existing EPUB highlight. */
  async function updateRecord(
    id: string,
    patch: {
      note?: string;
      tags?: string[];
      color?: string;
      style?: HIGHLIGHT_STYLES;
    },
  ) {
    const current = getRecord(id);
    if (!current) return;
    const payload: Partial<MyZRecord> = {
      id,
      kind: current.kind,
      note: patch.note ?? current.note ?? "",
      tags: patch.tags ?? current.tags ?? [],
    };
    if (current.kind === RECORD_KINDS.HIGHLIGHT) {
      payload.color = patch.color ?? current.color ?? deps.lastColor.value;
      payload.style = patch.style ?? current.style ?? deps.lastStyle.value;
    }
    const updated = await invoke("myz:updateHighlight", payload);
    if (updated) {
      deps.records.value = deps.records.value.map((record) =>
        record.id === id ? updated : record,
      );
      if (patch.color) deps.lastColor.value = patch.color;
      if (patch.style) deps.lastStyle.value = patch.style;
    }
  }

  return {
    loadRecords,
    applyCurrentChapter,
    createHighlight,
    deleteRecord,
    getRecord,
    updateRecord,
  };
}

export type EpubHighlightActions = ReturnType<typeof createEpubHighlights>;
