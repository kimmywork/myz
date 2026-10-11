import { normalizeRecord } from "@myz/shared/highlightUtils";
import { sendMessage } from "@myz/shared/messaging";
import { CONTENT_TYPES, RECORD_KINDS, type MyZRecord } from "@myz/shared/types";
import { extractHostname } from "@myz/shared/url";
import { computed } from "vue";
import {
  buildHighlightCounts,
  buildHighlightGroups,
} from "../annotations/highlight-groups.js";
import { createSelectionEvents } from "../annotations/selection-events.js";
import {
  extractSelection,
  renderOverlays,
  selectTextInPage,
} from "../annotations.js";
import type { PdfDocument } from "../pdf-document.js";
import { sourceKeyOf, sourceTypeOf, type PdfSourceRef } from "../source.js";
import type { ReaderState } from "../stores/state.js";

export interface AnnotationsDeps {
  pageElements: () => HTMLElement[];
  getStage: () => HTMLElement | null;
  getDoc: () => PdfDocument | null;
  getCurrent: () => PdfSourceRef | null;
  goToPage: (target: number) => Promise<void>;
}

/**
 * Annotation lifecycle: loading, overlay painting, text selection handling,
 * inspector drafts and highlight navigation.
 */
export function usePdfAnnotations(state: ReaderState, deps: AnnotationsDeps) {
  const activeRecord = computed(
    () =>
      state.annotations.value.find(
        (item) => item.id === state.activeId.value,
      ) ?? null,
  );

  const highlightCounts = computed(() =>
    buildHighlightCounts(state.annotations.value),
  );

  const highlightGroups = computed(() =>
    buildHighlightGroups(
      state.annotations.value,
      state.highlightFilter.value,
      state.highlightQuery.value,
    ),
  );

  /** Paints stored annotations for a single page (engine render hook). */
  function renderPage(pageEl: HTMLElement) {
    renderOverlays(pageEl, state.annotations.value, state.activeId.value);
  }

  function redrawOverlays() {
    const active = state.activeId.value;
    deps
      .pageElements()
      .forEach((el) => renderOverlays(el, state.annotations.value, active));
  }

  async function loadAnnotations() {
    const current = deps.getCurrent();
    if (!current) return;
    try {
      const records = await sendMessage<{ url: string }, MyZRecord[]>(
        "myz:getHighlightsForUrl",
        { url: sourceKeyOf(current) },
      );
      state.annotations.value = (records || [])
        .map((record) => normalizeRecord(record))
        .filter((record): record is MyZRecord => Boolean(record));
    } catch (err) {
      console.error("Failed to load annotations", err);
      state.annotations.value = [];
    }
    redrawOverlays();
  }

  function applyCurrentSelection() {
    const stage = deps.getStage();
    if (!stage) return;
    const next = extractSelection(stage);
    if (!next) {
      state.selection.value = null;
      return;
    }
    const range = window.getSelection()?.getRangeAt(0);
    const rect = range?.getBoundingClientRect();
    state.selection.value = next;
    state.selectionPos.value = rect
      ? {
          top: rect.top - 8,
          left: rect.left + rect.width / 2,
          bottom: rect.bottom,
        }
      : { top: 160, left: 240, bottom: 200 };
  }

  function clearSelection() {
    state.selection.value = null;
  }

  const events = createSelectionEvents(state, {
    getStage: deps.getStage,
    applySelection: applyCurrentSelection,
    redraw: redrawOverlays,
  });

  async function createAnnotation(kind: RECORD_KINDS) {
    const next = state.selection.value;
    const current = deps.getCurrent();
    if (!next || !current) return;
    const isHighlight = kind === RECORD_KINDS.HIGHLIGHT;
    const sourceKey = sourceKeyOf(current);
    const payload: Partial<MyZRecord> = {
      kind,
      text: next.text,
      url: sourceKey,
      sourceUrl: sourceKey,
      title: state.label.value,
      hostname:
        current.kind === "web" ? extractHostname(current.url) : "本地文件",
      sourceType: sourceTypeOf(current),
      contentType: CONTENT_TYPES.PLAIN,
      pdfLocator: {
        pageNumber: next.pageNumber,
        text: next.text,
        occurrenceIndex: next.occurrenceIndex,
        rects: next.rects,
      },
    };
    if (isHighlight) {
      payload.color = state.lastColor.value;
      payload.style = state.lastStyle.value;
    }
    const saved = await sendMessage<Partial<MyZRecord>, MyZRecord>(
      "myz:saveHighlight",
      payload,
    );
    const normalized = normalizeRecord(saved);
    if (normalized) {
      state.annotations.value = [
        ...state.annotations.value.filter((item) => item.id !== normalized.id),
        normalized,
      ];
      state.activeId.value = normalized.id;
    }
    state.selection.value = null;
    window.getSelection()?.removeAllRanges();
    redrawOverlays();
  }

  async function patchActive(patch: Partial<MyZRecord>) {
    if (!state.activeId.value) return;
    const updated = await sendMessage<Partial<MyZRecord>, MyZRecord>(
      "myz:updateHighlight",
      { id: state.activeId.value, ...patch },
    );
    const normalized = normalizeRecord(updated);
    if (normalized) {
      state.annotations.value = state.annotations.value.map((item) =>
        item.id === normalized.id ? normalized : item,
      );
    }
    if (patch.style) {
      state.lastStyle.value = patch.style as typeof state.lastStyle.value;
    }
    if (patch.color) state.lastColor.value = patch.color;
    state.savedAt.value = Date.now();
    state.dirty.value = false;
    redrawOverlays();
  }

  async function deleteActive() {
    if (!state.activeId.value) return;
    const id = state.activeId.value;
    await sendMessage("myz:removeHighlight", { id });
    state.annotations.value = state.annotations.value.filter(
      (item) => item.id !== id,
    );
    state.activeId.value = null;
    redrawOverlays();
  }

  function commitActive() {
    const record = activeRecord.value;
    if (!record) return;
    const tags = state.tagsDraft.value
      .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
      .filter(Boolean)
      .filter((tag, index, list) => list.indexOf(tag) === index);
    const sameTags =
      (record.tags || []).length === tags.length &&
      (record.tags || []).every((tag, index) => tag === tags[index]);
    const patch: Partial<MyZRecord> = {};
    if ((record.note || "") !== state.noteDraft.value) {
      patch.note = state.noteDraft.value;
    }
    if (!sameTags) patch.tags = tags;
    if (Object.keys(patch).length > 0) {
      void patchActive(patch);
    } else {
      state.dirty.value = false;
      state.savedAt.value = Date.now();
    }
  }

  function savedLabel() {
    if (state.dirty.value) return "未保存";
    if (state.savedAt.value) {
      return `已保存 ${new Date(state.savedAt.value).toLocaleTimeString()}`;
    }
    return "";
  }

  /**
   * Jumps to a stored annotation: scrolls to its page, then offsets the stage
   * so the first rect sits near the upper third, and activates it.
   */
  async function focusAnnotation(record: MyZRecord) {
    const locator = record.pdfLocator;
    const stage = deps.getStage();
    if (!locator || !deps.getDoc() || !stage) return;
    await deps.goToPage(locator.pageNumber);
    const el = stage.querySelector<HTMLElement>(
      `.pdf-page[data-page="${locator.pageNumber}"]`,
    );
    const rects = locator.rects || [];
    if (el && rects.length) {
      const pageRect = el.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      const targetY =
        pageRect.top - stageRect.top + rects[0].y * pageRect.height;
      stage.scrollTop += targetY - stage.clientHeight * 0.3;
    }
    state.activeId.value = record.id;
    state.selection.value = null;
    redrawOverlays();

    const marker = stage.querySelector<HTMLElement>(
      `.pdf-annotation[data-id="${record.id}"]`,
    );
    if (marker) {
      marker.classList.remove("is-flash");
      void marker.offsetWidth;
      marker.classList.add("is-flash");
      window.setTimeout(() => marker.classList.remove("is-flash"), 1200);
    }
  }

  function selectTextForTest(target: string, pageNumber = 1): boolean {
    const stage = deps.getStage();
    const el = stage?.querySelector<HTMLElement>(
      `.pdf-page[data-page="${pageNumber}"]`,
    );
    if (!el || !selectTextInPage(el, target)) return false;
    applyCurrentSelection();
    return true;
  }

  return {
    activeRecord,
    highlightCounts,
    highlightGroups,
    renderPage,
    redrawOverlays,
    loadAnnotations,
    applyCurrentSelection,
    clearSelection,
    attachStage: events.attachStage,
    detachStage: events.detachStage,
    createAnnotation,
    patchActive,
    deleteActive,
    commitActive,
    savedLabel,
    focusAnnotation,
    selectTextForTest,
  };
}
