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
import { IconClose, IconEdit, IconTrash } from "@/shared/icons.js";

export default defineComponent({
  name: "MyZInspector",
  setup() {
    const store = useInspectorStore();
    const { visible, record, inspectorAnchor } = storeToRefs(store);
    const inspectorRef = ref<HTMLElement | null>(null);
    const inspectorHeight = ref(0);
    const inspectorFontSize = ref(16);
    let resizeObserver: ResizeObserver | null = null;

    const noteText = computed(() => {
      const value =
        typeof record.value.note === "string"
          ? record.value.note.trim()
          : "";
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
            <div class="myz-inspector__note">{noteText.value}</div>
          </div>
        ) : null}

        <div class="myz-inspector__actions">
          <button
            type="button"
            class="myz-inspector__icon-btn myz-inspector__icon-btn--edit"
            aria-label="编辑标注"
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
            aria-label="删除标注"
            onClick={() => store.deleteRecord()}
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
