import { defineComponent, onErrorCaptured, ref } from "vue";

/**
 * Vue equivalent of stitch-web's React `ErrorBoundary`: a render error in one
 * mode shows a recoverable panel instead of blanking the page. Retrying
 * remounts the subtree via the `attempt` key.
 */
export default defineComponent({
  name: "StitchErrorBoundary",
  props: {
    label: { type: String, default: "" },
  },
  setup(props, { slots }) {
    const error = ref<Error | null>(null);
    const attempt = ref(0);

    onErrorCaptured((err) => {
      error.value = err as Error;
      console.error("[myz-stitch] render error", err);
      return false;
    });

    return () => {
      if (error.value) {
        return (
          <div class="crash" role="alert">
            <h2>界面出错了{props.label ? ` · ${props.label}` : ""}</h2>
            <p class="crash-msg">
              {error.value.message || String(error.value)}
            </p>
            <p class="muted-note">
              其它模式仍可使用。点「重试」或切换模式即可恢复；如果反复出现，请刷新页面。
            </p>
            <div class="crash-actions">
              <button
                type="button"
                class="btn btn-primary"
                onClick={() => {
                  error.value = null;
                  attempt.value += 1;
                }}
              >
                重试
              </button>
              <button
                type="button"
                class="btn"
                onClick={() => window.location.reload()}
              >
                刷新页面
              </button>
            </div>
          </div>
        );
      }
      return <div key={attempt.value}>{slots.default?.()}</div>;
    };
  },
});
