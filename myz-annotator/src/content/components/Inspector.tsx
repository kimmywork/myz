import { defineComponent, computed, type Ref } from "vue";
import { useInspectorStore } from "@/content/stores/inspector-store.js";
import { highlightStyleIconMap } from "@/shared/icons.js";
import { HIGHLIGHT_STYLES } from "@/shared/types.js";

export default defineComponent({
  name: "MyZInspector",
  setup({}) {
    const store = useInspectorStore();

    const visible = store.visible;
    const record = store.record;

    const title: Ref<string> = computed(() => record.title || "标注详情");
    const metaText = computed(() => {
      const parts = Array.isArray(record.metaParts)
        ? record.metaParts.filter(Boolean)
        : [];
      return parts.join(" · ");
    });
    const tags = computed(() =>
      Array.isArray(record.tags) ? record.tags : [],
    );
    const hasTags = computed(() => tags.value.length > 0);
    const noteText = computed(() => {
      const value = typeof record.note === "string" ? record.note.trim() : "";
      return value || "无批注";
    });
    const kind = computed(() => record.kind || "highlight");
    const isHighlight = computed(() => kind.value === "highlight");
    const styleIconKey = computed(() =>
      isHighlight.value ? record.styleIconKey || "" : "",
    );
    const StyleIconComponent = computed(() =>
      isHighlight.value
        ? highlightStyleIconMap[styleIconKey.value as HIGHLIGHT_STYLES]
        : null,
    );
    const styleLabel = computed(() =>
      isHighlight.value ? record.styleLabel || "" : "",
    );
    const styleValue = computed(() =>
      isHighlight.value ? record.style || "" : "",
    );
    const color = computed(() => (isHighlight.value ? record.color || "" : ""));
    const quoteHtml = computed(() =>
      typeof record.html === "string" ? record.html : "",
    );
    const quoteText = computed(() =>
      typeof record.text === "string" ? record.text : "",
    );

    return () => {
      return (
        <aside class={["myz-inspector", visible ? "" : "myz-hidden"]}>
          <div class="myz-inspector__header">
            <div class="myz-inspector__title">{title.value}</div>
            <button
              type="button"
              class="myz-inspector__close"
              onClick={() => store.hide()}
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
            <button
              type="button"
              class="myz-btn-secondary"
              onClick={() => store.copy()}
            >
              复制
            </button>
            <button
              type="button"
              class="myz-btn-primary"
              onClick={() => store.edit()}
            >
              编辑
            </button>
            <button
              type="button"
              class="myz-btn-danger"
              onClick={() => store.deleteRecord()}
            >
              删除
            </button>
          </div>
        </aside>
      );
    };
  },
});
