import { createApp } from "vue";
import { normalizeHighlightStyle } from "../shared/highlightUtils.ts";
import { isHighlightRecord } from "../shared/highlightUtils.ts";
import { sendMessage } from "../shared/messaging.ts";
import { serializeRange } from "../shared/serializer.ts";
import {
  MyZRecord,
  DEFAULT_COLORS,
  DEFAULT_HIGHLIGHT_STYLE,
  RECORD_KINDS,
} from "../shared/types.ts";
import { canonicalUrl, extractArchiveInfo } from "../shared/url.ts";
import ModalApp, {
  ModalOpenOptions,
  ModalSubmitPayload,
} from "./components/Modal.tsx";

import {
  storeRecord,
  updateExistingHighlight,
  deleteHighlight,
  applyHighlight,
  removeHighlightFromPending,
  markHighlightForReapply,
  updateHighlightIndicators,
  deleteUnreachableHighlights,
  getHighlightCache,
  mergeArchiveResult,
  getArchiveState,
} from "./highlight-state.ts";
import { showNotification } from "./notificaton-state.ts";

import { createShadowHost } from "./shadow-dom.ts";

import { hideToolbar } from "./toolbar-state.ts";

const modal = mountModal();

function mountModal() {
  const { host, mountPoint } = createShadowHost();

  const app = createApp(ModalApp, {
    onClose: handleModalClose,
    onSubmit: handleModalSubmit,
    onDelete: handleModalDelete,
  });

  const instance = app.mount(mountPoint) as InstanceType<typeof ModalApp>;

  return {
    host,
    open: (options: ModalOpenOptions) => instance.open(options),
    hide: () => instance.hide(),
    isVisible: () => instance.isVisible(),
    addKnownTags: (tags: string[]) => instance.addKnownTags(tags),
    setKnownTags: (tags: string[]) => instance.setKnownTags(tags),
    contains: (node: Element) => host.contains(node),
  };
}

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

export function openModal(options: ModalOpenOptions) {
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

  modal.open({
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
  });
  modal?.addKnownTags?.(initialTags);
}

function closeModal({ fromComponent = false } = {}) {
  if (!fromComponent) {
    modal.hide();
  }
  state.currentRange = null;
  state.currentText = "";
  state.currentHtml = "";
  state.editingId = null;
  state.formKind = RECORD_KINDS.HIGHLIGHT;
}

async function handleModalSubmit(payload: ModalSubmitPayload) {
  const kind =
    payload.kind === RECORD_KINDS.CLIP
      ? RECORD_KINDS.CLIP
      : RECORD_KINDS.HIGHLIGHT;
  const note = typeof payload.note === "string" ? payload.note.trim() : "";
  const tags = Array.isArray(payload.tags) ? payload.tags.filter(Boolean) : [];
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
          modal.addKnownTags?.(stored.tags || tags);
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
          modal.addKnownTags?.(stored.tags || tags);
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
    hideToolbar();
  }
}

function handleModalClose() {
  closeModal({ fromComponent: true });
}

async function handleModalDelete() {
  if (state.editingId) {
    await deleteHighlight(state.editingId);
  }
  closeModal();
}

async function ensureArchiveSnapshotForCurrentPage({ force = false } = {}) {
  if (!getArchiveState().archiveFeatureEnabled) {
    return null;
  }
  const canonical = canonicalUrl(window.location.href);
  if (!canonical) {
    return null;
  }
  try {
    const result = await sendMessage("myz:ensureArchiveSnapshot", {
      url: canonical,
      force,
    });
    mergeArchiveResult(result);
    if (!result) {
      return null;
    }
    if (result.saved && result.status === "saved") {
      showNotification("页面已保存到 Internet Archive");
    } else if (result.status === "exists") {
      showNotification("Internet Archive 已存在该页面的存档");
    } else if (result.status === "pending") {
      showNotification("已提交保存请求，存档生成可能需要一些时间");
    }
    return result;
  } catch (error) {
    console.error("Internet Archive 保存失败", error);
    showNotification("保存到 Internet Archive 失败，请稍后重试");
    return null;
  }
}

export function addModalKnownTags(tags: string[]) {
  modal?.addKnownTags?.(tags);
}

export function setModalKnownTags(tags: string[]) {
  modal?.setKnownTags?.(tags);
}

export function isModalVisible() {
  return modal?.isVisible?.() || false;
}

export function getModalState() {
  return { ...state };
}

export function patchModalState(patch: Partial<ModalState>) {
  Object.assign(state, patch);
}
