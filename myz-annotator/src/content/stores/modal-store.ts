import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { ArchiveEntry } from "../../background/internetArchive";
import {
  isHighlightRecord,
  normalizeHighlightStyle,
} from "../../shared/highlightUtils";
import { sendMessage } from "../../shared/messaging";
import { serializeRange } from "../../shared/serializer";
import {
  DEFAULT_COLORS,
  DEFAULT_HIGHLIGHT_STYLE,
  HIGHLIGHT_STYLES,
  MyZRecord,
  RECORD_KINDS,
} from "../../shared/types";
import { canonicalUrl, extractArchiveInfo } from "../../shared/url";
import {
  applyHighlight,
  deleteHighlight,
  deleteUnreachableHighlights,
  getArchiveState,
  getHighlightCache,
  markHighlightForReapply,
  removeHighlightFromPending,
  storeRecord,
  updateExistingHighlight,
  updateHighlightIndicators,
} from "../highlight-state";
import { ensureArchiveSnapshotForCurrentPage } from "../modal-state";
import { useToolbarStore } from "./toolbar-store";

interface ModalState {
  currentRange: Range | null;
  currentText: string;
  currentHtml: string;
  editingId: string | null;
  formKind: RECORD_KINDS;
}

const state: ModalState = {
  currentRange: null,
  currentText: "",
  currentHtml: "",
  editingId: null,
  formKind: RECORD_KINDS.HIGHLIGHT,
};

export interface ModalSubmitPayload {
  mode: "create" | "edit";
  kind: RECORD_KINDS;
  note: string;
  tags: string[];
  color: string;
  style: string;
  saveToArchive: boolean;
}

export interface ModalOpenOptions {
  mode?: "create" | "edit";
  kind?: RECORD_KINDS;
  editingId?: string | null;
  preview?: string;
  note?: string;
  tags?: string[];
  color?: string | null;
  style?: HIGHLIGHT_STYLES | null;
  archiveEnabled?: boolean;
  saveToArchive?: boolean;
  archiveStatus?: ArchiveEntry;
}

export const useModalStore = defineStore("modal", () => {
  const toolbarStore = useToolbarStore();

  const modalState = ref<ModalState>({ ...state });
  const modalOpenOptions = ref<ModalOpenOptions>({});

  const knownTags = ref<string[]>([]);
  const visible = ref(false);

  function open(options: ModalOpenOptions) {
    const kind =
      options.kind === RECORD_KINDS.CLIP
        ? RECORD_KINDS.CLIP
        : RECORD_KINDS.HIGHLIGHT;
    const initialTags = Array.isArray(options.tags)
      ? options.tags.filter(Boolean)
      : options.tags
        ? [options.tags]
        : [];
    const archiveState = getArchiveState();
    const archiveEnabledForModal =
      kind === RECORD_KINDS.HIGHLIGHT &&
      archiveState.archiveFeatureEnabled &&
      options?.mode !== "edit";
    const saveToArchiveDefault =
      typeof options?.saveToArchive === "boolean"
        ? options.saveToArchive
        : archiveEnabledForModal && archiveState.archiveDefaultOptIn;
    const archiveStatusPayload = archiveEnabledForModal
      ? archiveState.archiveStatus
      : null;

    modalOpenOptions.value = {
      mode: options.mode,
      preview: options.preview,
      note: options.note,
      tags: initialTags,
      color: kind === RECORD_KINDS.HIGHLIGHT ? options?.color : undefined,
      style: kind === RECORD_KINDS.HIGHLIGHT ? options?.style : undefined,
      kind,
      archiveEnabled: archiveEnabledForModal,
      saveToArchive: saveToArchiveDefault,
      archiveStatus: archiveStatusPayload,
    };
    visible.value = true;
  }
  function hide() {
    visible.value = false;
  }
  function patchModalState(patch: Partial<ModalState>) {
    modalState.value = { ...modalState.value, ...patch };
  }

  async function submit(payload: ModalSubmitPayload) {
    const kind =
      payload.kind === RECORD_KINDS.CLIP
        ? RECORD_KINDS.CLIP
        : RECORD_KINDS.HIGHLIGHT;
    const note = typeof payload.note === "string" ? payload.note.trim() : "";
    const tags = Array.isArray(payload.tags)
      ? payload.tags.filter(Boolean)
      : [];
    const saveToArchive = payload.saveToArchive === true;

    state.formKind = kind;

    const style = { color: DEFAULT_COLORS[0], style: DEFAULT_HIGHLIGHT_STYLE };

    if (kind === RECORD_KINDS.HIGHLIGHT) {
      const fallbackColor = DEFAULT_COLORS[0];
      style.color =
        typeof payload.color === "string" && payload.color.trim()
          ? payload.color.trim()
          : fallbackColor;
      style.style = normalizeHighlightStyle(
        payload.style || DEFAULT_HIGHLIGHT_STYLE,
      );
    }

    const currentUrl = window.location.href;
    const canonical = canonicalUrl(currentUrl);
    const archiveInfo = extractArchiveInfo(currentUrl);
    const originalSourceUrl = archiveInfo?.originalUrl || currentUrl;
    let hostname = window.location.hostname;
    try {
      hostname = new URL(originalSourceUrl).hostname || hostname;
    } catch (error) {
      // keep existing hostname fallback
    }
    const archiveUrl = archiveInfo ? currentUrl : null;
    const archiveTimestamp = archiveInfo?.timestamp || null;

    if (state.editingId) {
      const update: Partial<MyZRecord> = {
        id: state.editingId,
        note,
        tags,
        kind,
      };
      if (kind === RECORD_KINDS.HIGHLIGHT) {
        update.color = style.color;
        update.style = style.style;
      } else {
        update.color = undefined;
        update.range = undefined;
        update.style = undefined;
      }
      await updateExistingHighlight(update);
      closeModal();
      return;
    }

    if (!state.currentText) {
      closeModal();
      return;
    }

    const basePayload: Partial<MyZRecord> = {
      url: canonical,
      sourceUrl: originalSourceUrl,
      title: document.title,
      text: state.currentText,
      html: state.currentHtml || "",
      note,
      tags,
      hostname,
      kind,
    };

    if (archiveUrl) {
      basePayload.archiveUrl = archiveUrl;
      basePayload.archiveSnapshotUrl = archiveUrl;
      if (archiveTimestamp) {
        basePayload.archiveSnapshotTimestamp = archiveTimestamp;
      }
    }

    const selection = window.getSelection();
    try {
      if (kind === RECORD_KINDS.HIGHLIGHT) {
        if (!state.currentRange) {
          return;
        }
        const serializedRange = serializeRange(
          state.currentRange,
          getHighlightCache(),
          applyHighlight,
        );
        if (!serializedRange) {
          return;
        }
        const payloadToSave = {
          ...basePayload,
          ...style,
          range: serializedRange,
        };
        const record = await sendMessage("myz:saveHighlight", payloadToSave);
        if (record) {
          const stored = storeRecord(record);
          if (stored) {
            const applied = applyHighlight(stored);
            if (applied) {
              deleteUnreachableHighlights(stored.id);
              removeHighlightFromPending(stored.id);
            } else if (isHighlightRecord(stored)) {
              markHighlightForReapply(stored.id);
            }
            addModalKnownTags(stored.tags || tags);
            updateHighlightIndicators();
            if (saveToArchive && getArchiveState().archiveFeatureEnabled) {
              ensureArchiveSnapshotForCurrentPage().catch(() => {});
            }
          }
        }
      } else {
        const payloadToSave = {
          ...basePayload,
          color: null,
          style: null,
          range: null,
        };
        const record = await sendMessage("myz:saveHighlight", payloadToSave);
        if (record) {
          const stored = storeRecord(record);
          if (stored) {
            deleteUnreachableHighlights(stored.id);
            removeHighlightFromPending(stored.id);
            addModalKnownTags(stored.tags || tags);
            updateHighlightIndicators();
          }
        }
      }
    } catch (error) {
      console.error("Failed to save highlight", error);
    } finally {
      closeModal();
      selection?.removeAllRanges();
      // todo: toolbar
      toolbarStore.hide();
    }
  }

  function addModalKnownTags(tags: string[]) {
    knownTags.value = Array.from(new Set([...knownTags.value, ...tags]));
  }

  function setModalKnownTags(tags: string[]) {
    knownTags.value = tags;
  }

  function closeModal({ fromComponent = false } = {}) {
    if (!fromComponent) {
      hide();
    }
    modalState.value.currentRange = null;
    modalState.value.currentText = "";
    modalState.value.currentHtml = "";
    modalState.value.editingId = null;
    modalState.value.formKind = RECORD_KINDS.HIGHLIGHT;
  }

  async function deleteRecord() {
    await deleteHighlight(state.editingId!);
    closeModal();
  }

  const isVisible = computed(() => visible.value);
  return {
    modalState,
    open,
    hide,
    patchModalState,
    addModalKnownTags,
    setModalKnownTags,
    knownTags: computed(() => knownTags.value),
    modalOpenOptions,
    closeModal,
    isVisible,
    submit,
    deleteRecord,
  };
});
