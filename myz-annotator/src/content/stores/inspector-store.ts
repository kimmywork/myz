import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { recordToMarkdown } from "../../dashboard/utils/records.js";
import { normalizeHighlightStyle } from "../../shared/highlightUtils.js";
import {
  MyZRecord,
  RECORD_KINDS,
  HIGHLIGHT_STYLE_OPTIONS,
  HIGHLIGHT_STYLES,
  getRecordKind,
  DEFAULT_COLORS,
} from "../../shared/types.js";
import { resolveHighlightColor } from "../apply-highlight.js";
import { deleteHighlight, getFromHighlightCache } from "../highlight-state.js";
import { useModalStore } from "./modal-store.js";

interface InspectorRecord {
  id: string | null;
  title: string;
  metaParts: string[];
  tags: string[];
  html: string;
  text: string;
  note: string;
  style: HIGHLIGHT_STYLES | null;
  styleIconKey: string;
  styleLabel: string;
  color: string;
  kind: RECORD_KINDS;
}

const DEFAULT_RECORD: InspectorRecord = {
  id: null,
  title: "标注详情",
  metaParts: [],
  tags: [],
  html: "",
  text: "",
  note: "",
  style: null,
  styleIconKey: "",
  styleLabel: "",
  color: "",
  kind: RECORD_KINDS.HIGHLIGHT,
};

export const useInspectorStore = defineStore("inspector", () => {
  const modalStore = useModalStore();
  const inspectingId = ref<string | null>(null);
  const visible = ref(false);
  const record = ref<InspectorRecord>({ ...DEFAULT_RECORD });

  function showRecord(rawRecord: Partial<MyZRecord>) {
    const computedKind =
      getRecordKind(rawRecord as MyZRecord) || RECORD_KINDS.HIGHLIGHT;
    const createdAt = rawRecord.createdAt
      ? new Date(rawRecord.createdAt)
      : null;
    const metaParts = [];
    if (createdAt && !Number.isNaN(createdAt.getTime())) {
      metaParts.push(createdAt.toLocaleString());
    }
    if (rawRecord.hostname) {
      metaParts.push(rawRecord.hostname);
    }

    let style: HIGHLIGHT_STYLES | null = null;
    let resolvedColor = "";
    let styleIconKeyValue = "";
    let styleLabelValue = "";
    if (computedKind === "highlight") {
      style = normalizeHighlightStyle(rawRecord.style);
      resolvedColor = resolveHighlightColor(rawRecord.color);
      const meta = HIGHLIGHT_STYLE_OPTIONS[style] || null;
      if (meta) {
        styleIconKeyValue = meta.icon as HIGHLIGHT_STYLES;
        styleLabelValue = meta.label || "";
      } else {
        const fallback = HIGHLIGHT_STYLE_OPTIONS.paint || null;
        if (fallback) {
          styleIconKeyValue = fallback.icon as HIGHLIGHT_STYLES;
          styleLabelValue = fallback.label || "";
        }
      }
    }

    record.value = {
      id: rawRecord.id ?? null,
      title: rawRecord.title || rawRecord.hostname || DEFAULT_RECORD.title,
      metaParts,
      tags: Array.isArray(rawRecord.tags) ? rawRecord.tags.filter(Boolean) : [],
      html: rawRecord.html || "",
      text: rawRecord.text || "",
      note: typeof rawRecord.note === "string" ? rawRecord.note : "",
      style,
      styleIconKey: styleIconKeyValue,
      styleLabel: styleLabelValue,
      color: resolvedColor,
      kind: computedKind,
    };
    visible.value = true;
    inspectingId.value = rawRecord.id || null;
  }

  function hide() {
    if (!visible.value) {
      return;
    }
    visible.value = false;
    inspectingId.value = null;
    record.value = { ...DEFAULT_RECORD };
  }

  function deleteRecord() {
    if (record.value.id) {
      deleteHighlight(record.value.id);
    }
    hide();
  }

  function edit() {
    const id = inspectingId.value;
    if (!id) {
      return;
    }
    const record = getFromHighlightCache(id);
    if (!record) {
      return;
    }
    modalStore.patchModalState({
      editingId: record.id,
    });
    modalStore.open({
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
  async function copy() {
    const id = inspectingId.value;
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

  function isInspecting(id: string) {
    return inspectingId.value === id;
  }

  return {
    inspectingId: computed(() => inspectingId.value),
    showRecord,
    hide,
    deleteRecord,
    edit,
    copy,
    visible: computed(() => visible.value),
    record: computed(() => record.value),
    isInspecting,
  };
});
