import {
  defineComponent,
  ref,
  computed,
  type DefineComponent,
  type Ref,
} from "vue";
import { normalizeHighlightStyle } from "../../shared/highlightUtils.js";
import { highlightStyleIconMap } from "../../shared/icons.js";
import {
  MyZRecord,
  RECORD_KINDS,
  HIGHLIGHT_STYLE_OPTIONS,
  HIGHLIGHT_STYLES,
  getRecordKind,
} from "../../shared/types.js";

import { resolveHighlightColor } from "../apply-highlight.js";

interface InsepctorState {
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

const DEFAULT_STATE: InsepctorState = {
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

interface InspectorProps {
  highlightStyleOptions: Record<string, { icon: string; label: string }>;
  resolveHighlightColor: (color: string | undefined) => string;
  onClose?: () => void;
  onCopy?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

interface InspectorExpose {
  showRecord: (record: Partial<MyZRecord>) => void;
  hide: (options?: { silent?: boolean }) => void;
  isVisible: () => boolean;
  getCurrentId: () => string | null;
}

export default defineComponent({
  name: "MyZInspector",
  props: {
    highlightStyleOptions: {
      type: Object,
      required: true,
    },
    onClose: {
      type: Function,
      default: null,
    },
    onCopy: {
      type: Function,
      default: null,
    },
    onEdit: {
      type: Function,
      default: null,
    },
    onDelete: {
      type: Function,
      default: null,
    },
  },
  emits: ["shown", "hidden"],
  setup(props, { emit, expose }) {
    const visible = ref(false);
    const record: Ref<InsepctorState> = ref({ ...DEFAULT_STATE });

    const title: Ref<string> = computed(() => record.value.title || "标注详情");
    const metaText = computed(() => {
      const parts = Array.isArray(record.value.metaParts)
        ? record.value.metaParts.filter(Boolean)
        : [];
      return parts.join(" · ");
    });
    const tags = computed(() =>
      Array.isArray(record.value.tags) ? record.value.tags : [],
    );
    const hasTags = computed(() => tags.value.length > 0);
    const noteText = computed(() => {
      const value =
        typeof record.value.note === "string" ? record.value.note.trim() : "";
      return value || "无批注";
    });
    const kind = computed(() => record.value.kind || "highlight");
    const isHighlight = computed(() => kind.value === "highlight");
    const styleIconKey = computed(() =>
      isHighlight.value ? record.value.styleIconKey || "" : "",
    );
    const StyleIconComponent = computed(() =>
      isHighlight.value
        ? highlightStyleIconMap[styleIconKey.value as HIGHLIGHT_STYLES]
        : null,
    );
    const styleLabel = computed(() =>
      isHighlight.value ? record.value.styleLabel || "" : "",
    );
    const styleValue = computed(() =>
      isHighlight.value ? record.value.style || "" : "",
    );
    const color = computed(() =>
      isHighlight.value ? record.value.color || "" : "",
    );
    const quoteHtml = computed(() =>
      typeof record.value.html === "string" ? record.value.html : "",
    );
    const quoteText = computed(() =>
      typeof record.value.text === "string" ? record.value.text : "",
    );

    function showRecord(rawRecord: Partial<MyZRecord> = {}) {
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
          const fallback = props.highlightStyleOptions?.paint || null;
          if (fallback) {
            styleIconKeyValue = fallback.icon as HIGHLIGHT_STYLES;
            styleLabelValue = fallback.label || "";
          }
        }
      }

      record.value = {
        id: rawRecord.id ?? null,
        title: rawRecord.title || rawRecord.hostname || DEFAULT_STATE.title,
        metaParts,
        tags: Array.isArray(rawRecord.tags)
          ? rawRecord.tags.filter(Boolean)
          : [],
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
      emit("shown", record.value.id);
    }

    function hide({ silent = false } = {}) {
      if (!visible.value) {
        if (!silent) {
          emit("hidden");
        }
        return;
      }
      visible.value = false;
      record.value = { ...DEFAULT_STATE };
      if (!silent) {
        emit("hidden");
      }
    }

    function isVisible() {
      return visible.value;
    }

    function getCurrentId() {
      return record.value.id;
    }

    function handleClose() {
      hide();
      props.onClose?.();
    }

    function handleCopy() {
      props.onCopy?.();
    }

    function handleEdit() {
      props.onEdit?.();
    }

    function handleDelete() {
      props.onDelete?.();
    }

    expose({
      showRecord,
      hide,
      isVisible,
      getCurrentId,
    });

    return () => (
      <aside class={["myz-inspector", visible.value ? "" : "myz-hidden"]}>
        <div class="myz-inspector__header">
          <div class="myz-inspector__title">{title.value}</div>
          <button
            type="button"
            class="myz-inspector__close"
            onClick={handleClose}
          >
            ×
          </button>
        </div>

        <div class="myz-inspector__body">
          <div class="myz-inspector__info">
            <span
              class={[
                "myz-inspector__style",
                isHighlight.value ? "" : "myz-hidden",
              ]}
              data-style={isHighlight.value ? styleValue.value : null}
              style={
                isHighlight.value && color.value
                  ? { "--myz-highlight-color": color.value }
                  : undefined
              }
              title={
                isHighlight.value && styleLabel.value && color.value
                  ? `${styleLabel.value} · ${color.value}`
                  : undefined
              }
            >
              {(() => {
                const IconComponent = StyleIconComponent.value;
                return IconComponent ? (
                  <IconComponent
                    class="myz-inspector__style-icon"
                    size={18}
                    aria-hidden="true"
                  />
                ) : null;
              })()}
            </span>
            <div class="myz-inspector__meta">{metaText.value}</div>
          </div>

          <div
            class={["myz-inspector__tags", hasTags.value ? "" : "myz-hidden"]}
          >
            {tags.value.map((tag) => (
              <span class="myz-tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>

          {quoteHtml.value ? (
            <blockquote
              class="myz-inspector__quote"
              innerHTML={quoteHtml.value}
            />
          ) : (
            <blockquote class="myz-inspector__quote">
              {quoteText.value}
            </blockquote>
          )}

          <div class="myz-inspector__note">{noteText.value}</div>
        </div>

        <div class="myz-inspector__actions">
          <button type="button" class="myz-btn-secondary" onClick={handleCopy}>
            复制
          </button>
          <button type="button" class="myz-btn-primary" onClick={handleEdit}>
            编辑
          </button>
          <button type="button" class="myz-btn-danger" onClick={handleDelete}>
            删除
          </button>
        </div>
      </aside>
    );
  },
}) as DefineComponent<InspectorProps, InspectorExpose>;
