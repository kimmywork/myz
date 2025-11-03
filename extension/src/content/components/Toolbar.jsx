import { defineComponent } from "vue";
import { IconPencil, IconNotebook, IconCamera } from "../../shared/icons.js";

export default defineComponent({
  name: "MyZToolbar",
  props: {
    onAnnotate: {
      type: Function,
      default: null,
    },
    onClip: {
      type: Function,
      default: null,
    },
    onCapture: {
      type: Function,
      default: null,
    },
  },
  setup(props) {
    const handleAnnotate = (event) => {
      event.preventDefault();
      props.onAnnotate?.(event);
    };

    const handleClip = (event) => {
      event.preventDefault();
      props.onClip?.(event);
    };

    const handleCapture = (event) => {
      event.preventDefault();
      props.onCapture?.(event);
    };

    return () => (
      <div class="myz-annotator-toolbar myz-hidden">
        <button type="button" aria-label="添加标注" onClick={handleAnnotate}>
          <IconPencil size={18} aria-hidden="true" />
        </button>
        <button type="button" aria-label="保存文字" onClick={handleClip}>
          <IconNotebook size={18} aria-hidden="true" />
        </button>
        <button type="button" aria-label="截取选区截图" onClick={handleCapture}>
          <IconCamera size={18} aria-hidden="true" />
        </button>
      </div>
    );
  },
});
