import { defineComponent } from "vue";

export default defineComponent({
  name: "MyZToolbar",
  props: {
    onAnnotate: {
      type: Function,
      default: null
    },
    onClip: {
      type: Function,
      default: null
    },
    onCapture: {
      type: Function,
      default: null
    }
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
          ✍️
        </button>
        <button type="button" aria-label="保存文字" onClick={handleClip}>
          📝
        </button>
        <button type="button" aria-label="截取选区截图" onClick={handleCapture}>
          📸
        </button>
      </div>
    );
  }
});
