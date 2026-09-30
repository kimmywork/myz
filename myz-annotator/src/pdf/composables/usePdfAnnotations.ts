import { normalizeRecord } from "@myz/shared/highlightUtils";
import { sendMessage } from "@myz/shared/messaging";
import { CONTENT_TYPES, RECORD_KINDS, type MyZRecord } from "@myz/shared/types";
import { extractHostname } from "@myz/shared/url";
import { computed } from "vue";
import {
  extractSelection,
  renderOverlays,
  selectTextInPage,
} from "../annotations.js";
import type { PdfDocument } from "../pdf-document.js";
import { sourceKeyOf, sourceTypeOf, type PdfSourceRef } from "../source.js";
import type { ReaderState } from "../stores/state.js";
import {
  pageAtPoint,
  selectBlockAtPoint,
  selectByDrag,
} from "../text-selection.js";

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
  let boundStage: HTMLElement | null = null;
  let dragStart: { x: number; y: number } | null = null;

  const activeRecord = computed(
    () =>
      state.annotations.value.find(
        (item) => item.id === state.activeId.value,
      ) ?? null,
  );

  const highlightCounts = computed(() => {
    const counts = { all: 0, highlight: 0, clip: 0 };
    for (const record of state.annotations.value) {
      if (!record.pdfLocator) {
        continue;
      }
      counts.all += 1;
      if (record.kind === RECORD_KINDS.HIGHLIGHT) {
        counts.highlight += 1;
      } else if (record.kind === RECORD_KINDS.CLIP) {
        counts.clip += 1;
      }
    }
    return counts;
  });

  /** Records matching the current kind filter and search query, by page. */
  const highlightGroups = computed(() => {
    const query = state.highlightQuery.value.trim().toLowerCase();
    const map = new Map<number, MyZRecord[]>();
    for (const record of state.annotations.value) {
      const locator = record.pdfLocator;
      if (!locator) {
        continue;
      }
      if (
        state.highlightFilter.value !== "all" &&
        record.kind !== state.highlightFilter.value
      ) {
        continue;
      }
      if (query) {
        const haystack = [
          record.text,
          record.note ?? "",
          ...(record.tags ?? []),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) {
          continue;
        }
      }
      const list = map.get(locator.pageNumber) ?? [];
      list.push(record);
      map.set(locator.pageNumber, list);
    }
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([pageNumber, records]) => ({ pageNumber, records }));
  });

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
    if (!current) {
      return;
    }
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
    if (!stage) {
      return;
    }
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

  function handleMouseDown(event: MouseEvent) {
    if (event.button !== 0) {
      dragStart = null;
      return;
    }
    if ((event.target as HTMLElement)?.closest(".pdf-annotation")) {
      dragStart = null;
      return;
    }
    dragStart = { x: event.clientX, y: event.clientY };
  }

  function handleMouseUp(event: MouseEvent) {
    if ((event.target as HTMLElement)?.closest(".pdf-annotation")) {
      return;
    }
    const stage = deps.getStage();
    const start = dragStart;
    dragStart = null;
    if (stage) {
      const startPage = start ? pageAtPoint(stage, start.x, start.y) : null;
      // Triple-click selects the whole block (paragraph) under the pointer.
      if (event.detail === 3) {
        const page =
          pageAtPoint(stage, event.clientX, event.clientY) ?? startPage;
        if (page && selectBlockAtPoint(page, event.clientX, event.clientY)) {
          window.setTimeout(applyCurrentSelection, 0);
          return;
        }
      } else if (event.detail === 1 && !event.shiftKey && start && startPage) {
        // Snap a drag to the geometry-derived lines/blocks so overshooting a
        // paragraph does not bleed into the next one.
        const endPage = pageAtPoint(stage, event.clientX, event.clientY);
        if (endPage === startPage) {
          const snapped = selectByDrag(startPage, start, {
            x: event.clientX,
            y: event.clientY,
          });
          if (snapped) {
            window.setTimeout(applyCurrentSelection, 0);
            return;
          }
        }
      }
    }
    window.setTimeout(applyCurrentSelection, 0);
  }

  function handleClick(event: MouseEvent) {
    const target = (event.target as HTMLElement)?.closest(
      ".pdf-annotation",
    ) as HTMLElement | null;
    if (target?.dataset.id) {
      state.activeId.value = target.dataset.id;
      state.selection.value = null;
      redrawOverlays();
    }
  }

  function handleSelectionKeyup(event: KeyboardEvent) {
    if (!event.shiftKey) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      return;
    }
    window.setTimeout(applyCurrentSelection, 0);
  }

  function attachStage(el: HTMLElement | null) {
    if (!el) {
      return;
    }
    boundStage = el;
    el.addEventListener("mousedown", handleMouseDown);
    el.addEventListener("mouseup", handleMouseUp);
    el.addEventListener("click", handleClick);
    el.addEventListener("keyup", handleSelectionKeyup);
  }

  function detachStage() {
    if (!boundStage) {
      return;
    }
    boundStage.removeEventListener("mousedown", handleMouseDown);
    boundStage.removeEventListener("mouseup", handleMouseUp);
    boundStage.removeEventListener("click", handleClick);
    boundStage.removeEventListener("keyup", handleSelectionKeyup);
    boundStage = null;
  }

  async function createAnnotation(kind: RECORD_KINDS) {
    const next = state.selection.value;
    const current = deps.getCurrent();
    if (!next || !current) {
      return;
    }
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
    if (!state.activeId.value) {
      return;
    }
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
    if (patch.color) {
      state.lastColor.value = patch.color;
    }
    state.savedAt.value = Date.now();
    state.dirty.value = false;
    redrawOverlays();
  }

  async function deleteActive() {
    if (!state.activeId.value) {
      return;
    }
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
    if (!record) {
      return;
    }
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
    if (!sameTags) {
      patch.tags = tags;
    }
    if (Object.keys(patch).length > 0) {
      void patchActive(patch);
    } else {
      state.dirty.value = false;
      state.savedAt.value = Date.now();
    }
  }

  function savedLabel() {
    if (state.dirty.value) {
      return "未保存";
    }
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
    if (!locator || !deps.getDoc() || !stage) {
      return;
    }
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
    if (!el || !selectTextInPage(el, target)) {
      return false;
    }
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
    attachStage,
    detachStage,
    createAnnotation,
    patchActive,
    deleteActive,
    commitActive,
    savedLabel,
    focusAnnotation,
    selectTextForTest,
  };
}
