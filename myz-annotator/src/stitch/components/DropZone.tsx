import { defineComponent, ref } from "vue";

/**
 * Click-or-drop image importer. Emits `files` with the picked/dropped list.
 * Vue port of stitch-web's `DropZone`.
 */
export default defineComponent({
  name: "StitchDropZone",
  props: {
    className: { type: String, default: "" },
    compact: { type: Boolean, default: false },
  },
  emits: ["files"],
  setup(props, { emit, slots }) {
    const inputRef = ref<HTMLInputElement | null>(null);
    const over = ref(false);

    const pick = () => inputRef.value?.click();

    return () => (
      <div
        class={[
          "dropzone",
          over.value ? "is-over" : "",
          props.compact ? "is-compact" : "",
          props.className,
        ]}
        onClick={pick}
        onDragover={(event: DragEvent) => {
          event.preventDefault();
          over.value = true;
        }}
        onDragleave={() => (over.value = false)}
        onDrop={(event: DragEvent) => {
          event.preventDefault();
          over.value = false;
          emit("files", event.dataTransfer?.files ?? null);
        }}
        role="button"
        tabindex={0}
        onKeydown={(event: KeyboardEvent) => {
          if (event.key === "Enter" || event.key === " ") pick();
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event: Event) => {
            const target = event.target as HTMLInputElement;
            emit("files", target.files);
            target.value = "";
          }}
        />
        {slots.default?.() ?? (
          <div class="dropzone-inner">
            <span class="dropzone-emoji">🖼️</span>
            <strong>点击或拖拽图片到这里</strong>
            <span class="dropzone-sub">
              支持多选 / 粘贴 / 1–16 张 · 全部本地处理
            </span>
          </div>
        )}
      </div>
    );
  },
});
