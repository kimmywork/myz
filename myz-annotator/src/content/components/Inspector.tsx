import { TagInput } from "@myz/dashboard-ui";
import { DELETE_CONFIRM, confirmDestructive } from "@myz/shared/dialogs";
import { IconClose, IconEdit, IconTrash } from "@myz/shared/icons";
import { storeToRefs } from "pinia";
import {
  defineComponent,
  computed,
  ref,
  onMounted,
  onBeforeUnmount,
  nextTick,
  watch,
} from "vue";
import { useInspectorStore } from "@/content/stores/inspector-store.js";
import { useModalStore } from "@/content/stores/modal-store.js";

export default defineComponent({
  name: "MyZInspector",
  setup() {
    const store = useInspectorStore();
    const modalStore = useModalStore();
    const { visible, record, inspectorAnchor, noteDraft, tagsDraft, dirty } =
      storeToRefs(store);
    const inspectorRef = ref<HTMLElement | null>(null);
    const inspectorHeight = ref(0);
    const inspectorFontSize = ref(16);
    let resizeObserver: ResizeObserver | null = null;

    const noteText = computed(() => {
      const value =
        typeof record.value.note === "string" ? record.value.note.trim() : "";
      return value;
    });
    const hasNote = computed(() => noteText.value.length > 0);

    const inspectorStyle = computed(() => {
      const anchor = inspectorAnchor.value;
      if (!anchor) {
        return undefined;
      }
      const spacing = inspectorFontSize.value || 16;
      const topAbove = anchor.top - spacing - inspectorHeight.value;
      const minTop = 8;
      const showAbove = topAbove >= minTop;
      const topPosition = showAbove
        ? topAbove
        : anchor.top + anchor.height + spacing;
      return {
        top: `${topPosition}px`,
        left: `${anchor.left + anchor.width / 2}px`,
        right: "auto",
        transform: "translateX(-50%)",
      };
    });

    const updateInspectorMetrics = () => {
      if (!inspectorRef.value) {
        inspectorHeight.value = 0;
        inspectorFontSize.value = 16;
        return;
      }
      inspectorHeight.value = inspectorRef.value.offsetHeight || 0;
      const fontSize = Number.parseFloat(
        window.getComputedStyle(inspectorRef.value).fontSize || "16",
      );
      if (Number.isFinite(fontSize) && fontSize > 0) {
        inspectorFontSize.value = fontSize;
      }
    };

    onMounted(() => {
      updateInspectorMetrics();
      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => {
          updateInspectorMetrics();
        });
        if (inspectorRef.value) {
          resizeObserver.observe(inspectorRef.value);
        }
      }
    });

    watch(
      () => [visible.value, noteText.value],
      async ([isVisible]) => {
        if (!isVisible) {
          return;
        }
        await nextTick();
        updateInspectorMetrics();
      },
    );

    onBeforeUnmount(() => {
      resizeObserver?.disconnect();
      resizeObserver = null;
    });

    return () => (
      <aside
        class={[
          "myz-inspector",
          visible.value ? "" : "myz-hidden",
          hasNote.value ? "" : "myz-inspector--toolbar",
        ]}
        style={inspectorStyle.value}
        ref={inspectorRef}
      >
        {hasNote.value ? (
          <div class="myz-inspector__body">
            <blockquote class="myz-inspector__quote">
              {record.value.text}
            </blockquote>
            <label class="myz-annotator-field myz-inspector__note-field">
              <span class="myz-inspector__label">批注</span>
              <textarea
                class="myz-inspector__note-input"
                rows="3"
                value={noteDraft.value}
                onInput={(event: Event) => {
                  store.noteDraft = (event.target as HTMLTextAreaElement).value;
                }}
              />
            </label>
            <div class="myz-inspector__tags">
              <TagInput
                modelValue={tagsDraft.value}
                options={modalStore.knownTags}
                placeholder="添加标签"
                allowNew={true}
                variant="content"
                onUpdate:modelValue={(value: string[]) => {
                  store.tagsDraft = Array.isArray(value) ? value : [];
                }}
              />
            </div>
          </div>
        ) : null}

        <div class="myz-inspector__actions">
          {hasNote.value ? (
            <button
              type="button"
              class="myz-inspector__save"
              disabled={!dirty.value}
              onClick={() => void store.save()}
            >
              保存
            </button>
          ) : null}
          <button
            type="button"
            class="myz-inspector__icon-btn myz-inspector__icon-btn--edit"
            aria-label="编辑划线与样式"
            onClick={() => {
              store.edit();
              store.hide();
            }}
          >
            <IconEdit size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            class="myz-inspector__icon-btn myz-inspector__icon-btn--delete"
            aria-label="删除划线"
            onClick={() => {
              if (confirmDestructive(DELETE_CONFIRM)) store.deleteRecord();
            }}
          >
            <IconTrash size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            class="myz-inspector__icon-btn myz-inspector__icon-btn--close"
            aria-label="关闭"
            onClick={() => store.hide()}
          >
            <IconClose size={16} aria-hidden="true" />
          </button>
        </div>
      </aside>
    );
  },
});
