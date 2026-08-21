import {
  isHighlightRecord,
  normalizeHighlightStyle,
} from "@myz/shared/highlightUtils";
import { sendMessage } from "@myz/shared/messaging";
import { serializeRange } from "@myz/shared/serializer";
import {
  CONTENT_TYPES,
  DEFAULT_COLORS,
  DEFAULT_HIGHLIGHT_STYLE,
  HIGHLIGHT_STYLES,
  MyZRecord,
  RECORD_KINDS,
} from "@myz/shared/types";
import { canonicalUrl } from "@myz/shared/url";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
  applyHighlight,
  deleteHighlight,
  deleteUnreachableHighlights,
  getHighlightCache,
  markHighlightForReapply,
  removeHighlightFromPending,
  storeRecord,
  updateExistingHighlight,
  updateHighlightIndicators,
} from "../highlight-state";
import { usePreferenceStore } from "./preference-store";
import { useToolbarStore } from "./toolbar-store";
import type {
  SaveHighlightMessagePayload,
  SaveHighlightMessageResult,
} from "@/background/messages/highlights";

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
}

export interface ModalOpenOptions {
  mode: "create" | "edit";
  kind: RECORD_KINDS;
  editingId: string | null;
  preview: string;
  note: string;
  tags: string[];
  color: string;
  style: HIGHLIGHT_STYLES;
}

const DEFAULT_OPTION = {
  mode: "create" as "create" | "edit",
  kind: RECORD_KINDS.HIGHLIGHT,
  editingId: null,
  preview: "",
  note: "",
  tags: [],
  color: DEFAULT_COLORS[0],
  style: HIGHLIGHT_STYLES.PAINT,
};

export const useModalStore = defineStore("modal", () => {
  const toolbarStore = useToolbarStore();
  const preferenceStore = usePreferenceStore();

  const modalState = ref<ModalState>({ ...state });
  const modalOpenOptions = ref<ModalOpenOptions>({ ...DEFAULT_OPTION });

  const knownTags = ref<string[]>([]);
  const visible = ref(false);

  function open(options: Partial<ModalOpenOptions>) {
    const kind =
      options.kind === RECORD_KINDS.CLIP
        ? RECORD_KINDS.CLIP
        : RECORD_KINDS.HIGHLIGHT;
    const initialTags = Array.isArray(options.tags)
      ? options.tags.filter(Boolean)
      : options.tags
        ? [options.tags]
        : [];

    const resolveColor = options.color
      ? options.color
      : preferenceStore.lastUsedColor;
    const resolveStyle = options.style
      ? options.style
      : preferenceStore.lastUsedStyle;

    modalOpenOptions.value = {
      mode: options.mode || "create",
      editingId: options.editingId || null,
      preview: options.preview || "",
      note: options.note || "",
      tags: initialTags,
      color: resolveColor || DEFAULT_COLORS[0],
      style: resolveStyle || DEFAULT_HIGHLIGHT_STYLE,
      kind,
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

    modalState.value.formKind = kind;

    console.log("Submitting modal", { payload, state: modalState.value });

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
    const originalSourceUrl = currentUrl;
    let hostname = window.location.hostname;
    try {
      hostname = new URL(originalSourceUrl).hostname || hostname;
    } catch (error) {
      // keep existing hostname fallback
    }

    if (modalState.value.editingId) {
      const update: Partial<MyZRecord> = {
        id: modalState.value.editingId,
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

    if (!modalState.value.currentText) {
      closeModal();
      return;
    }

    const basePayload: Partial<MyZRecord> = {
      url: canonical,
      sourceUrl: originalSourceUrl,
      title: document.title,
      text: modalState.value.currentText,
      html: modalState.value.currentHtml || "",
      note,
      tags,
      hostname,
      kind,
      contentType: CONTENT_TYPES.HTML,
    };

    const selection = window.getSelection();
    try {
      if (kind === RECORD_KINDS.HIGHLIGHT) {
        if (!modalState.value.currentRange) {
          return;
        }
        const serializedRange = serializeRange(
          modalState.value.currentRange,
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
        const record = await sendMessage<
          SaveHighlightMessagePayload,
          SaveHighlightMessageResult
        >("myz:saveHighlight", payloadToSave);
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
          }
        }
      } else {
        const payloadToSave = {
          ...basePayload,
          color: undefined,
          style: undefined,
          range: undefined,
        };
        const record = await sendMessage<
          SaveHighlightMessagePayload,
          SaveHighlightMessageResult
        >("myz:saveHighlight", payloadToSave);
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
    await deleteHighlight(modalState.value.editingId!);
    closeModal();
  }

  function isHighlight(): boolean {
    return modalOpenOptions.value.kind === RECORD_KINDS.HIGHLIGHT;
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
    isHighlight,
  };
});
