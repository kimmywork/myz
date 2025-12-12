import { createApp } from "vue";
import { recordToMarkdown } from "../dashboard/utils/records.ts";
import { normalizeHighlightStyle } from "../shared/highlightUtils.ts";
import {
  HIGHLIGHT_STYLE_OPTIONS,
  DEFAULT_COLORS,
  getRecordKind,
  MyZRecord,
} from "../shared/types.ts";
import { resolveHighlightColor } from "./apply-highlight.ts";
import InspectorApp from "./components/Inspector.tsx";

import { deleteHighlight, getFromHighlightCache } from "./highlight-state.ts";
import { openModal, patchModalState } from "./modal-state.ts";
import { createShadowHost } from "./shadow-dom.ts";

const inspector = mountInspector();

interface InspectorState {
  inspectingId: string | null;
}

const state: InspectorState = {
  inspectingId: null,
};

function mountInspector() {
  const { host, mountPoint } = createShadowHost();

  const app = createApp(InspectorApp, {
    highlightStyleOptions: HIGHLIGHT_STYLE_OPTIONS,
    getRecordKind,
    normalizeHighlightStyle,
    resolveHighlightColor,
    onClose: handleInspectorClose,
    onCopy: handleInspectorCopy,
    onEdit: handleInspectorEdit,
    onDelete: handleInspectorDelete,
    onShown: handleInspectorShown,
    onHidden: handleInspectorHidden,
  });

  const instance = app.mount(mountPoint) as InstanceType<typeof InspectorApp>;

  return {
    host,
    showRecord: (record: Partial<MyZRecord>) => instance.showRecord(record),
    hide: (options?: { silent?: boolean }) => instance.hide(options),
    isVisible: () => instance.isVisible(),
    getCurrentId: () => instance.getCurrentId(),
    contains: (node: Node) => host.contains(node),
  };
}

function handleInspectorClose() {
  state.inspectingId = null;
}

async function handleInspectorCopy() {
  const id = state.inspectingId || inspector.getCurrentId?.();
  if (!id) {
    return;
  }
  const record = getFromHighlightCache(id);
  if (!record) {
    return;
  }
  const markdown = recordToMarkdown(record);
  try {
    await navigator.clipboard.writeText(markdown);
  } catch (error) {
    console.error("Clipboard copy failed", error);
  }
}

function handleInspectorEdit() {
  const id = state.inspectingId || inspector.getCurrentId?.();
  if (!id) {
    return;
  }
  const record = getFromHighlightCache(id);
  if (!record) {
    return;
  }
  patchModalState({
    editingId: record.id,
  });
  openModal({
    mode: "edit",
    editingId: record.id,
    preview: record.text,
    note: record.note || "",
    tags: record.tags || [],
    color: record.color || DEFAULT_COLORS[0],
    style: record.style,
    kind: getRecordKind(record),
  });
}

function handleInspectorDelete() {
  const id = state.inspectingId || inspector.getCurrentId?.();
  if (!id) {
    return;
  }
  deleteHighlight(id);
}

function handleInspectorShown(id?: string) {
  state.inspectingId = id || null;
}

function handleInspectorHidden() {
  state.inspectingId = null;
}

export function showInspector(record: Partial<MyZRecord>) {
  inspector.showRecord(record);
}

export function hideInspector(options?: { silent?: boolean }) {
  inspector.hide(options);
}

export function isInspecting(id: string) {
  return state.inspectingId === id;
}
