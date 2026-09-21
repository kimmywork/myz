import { defineComponent, type PropType, type Ref } from "vue";

/** EPUB reading stage: the sandboxed, same-origin iframe with the chapter. */
export default defineComponent({
  name: "EpubStage",
  props: {
    title: { type: String, default: "" },
    chapterHtml: { type: String, required: true },
    onLoad: { type: Function as PropType<() => void>, required: true },
    /** The shell's iframe ref, so it can read the frame document. */
    frameRef: {
      type: Object as PropType<Ref<HTMLIFrameElement | null>>,
      required: true,
    },
  },
  setup(props) {
    return () => (
      <div class="epub-stage">
        <iframe
          ref={props.frameRef}
          class="epub-frame"
          title={props.title || "EPUB"}
          sandbox="allow-same-origin"
          srcdoc={props.chapterHtml}
          onLoad={props.onLoad}
        />
      </div>
    );
  },
});
