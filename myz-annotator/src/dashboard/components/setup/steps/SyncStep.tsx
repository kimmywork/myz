import { Check, Loader2, TriangleAlert } from "@lucide/vue";
import { defineComponent } from "vue";
import type { PropType } from "vue";
import { Notice, WizardFooter } from "../primitives.jsx";
import type { SetupWizardApi } from "../useSetupWizard.js";

/** First-sync step, shared by the create and join branches. */
export default defineComponent({
  name: "SetupSyncStep",
  props: {
    wizard: { type: Object as PropType<SetupWizardApi>, required: true },
  },
  setup(props) {
    return () => {
      const w = props.wizard;
      const state = w.syncState.value;
      const finished = state === "done" || state === "later";
      const isJoin = w.scenario.value === "join";
      return (
        <>
          <div class="grid gap-3">
            {state === "idle" ? (
              <Notice>
                正在把本机数据加密上传到 S3。稍后同步不会丢失本机数据。
              </Notice>
            ) : null}
            {state === "running" ? (
              <Notice>
                <span class="inline-flex items-center gap-2">
                  <Loader2 size={15} class="animate-spin" aria-hidden="true" />
                  正在上传本机数据…
                </span>
              </Notice>
            ) : null}
            {state === "done" ? (
              <Notice tone="success" icon={Check}>
                首次同步完成。
              </Notice>
            ) : null}
            {state === "failed" ? (
              <Notice tone="error" icon={TriangleAlert}>
                同步失败，可重试，或稍后在设置页同步。
              </Notice>
            ) : null}
            {state === "later" ? (
              <Notice tone="warn" icon={TriangleAlert}>
                已标记为「未完成同步」，可稍后在设置页点击「立即同步」。
              </Notice>
            ) : null}
          </div>
          <WizardFooter wizard={w}>
            {finished ? (
              <button
                class="btn btn-primary"
                type="button"
                onClick={() => {
                  if (isJoin) {
                    w.finish();
                  } else {
                    w.step.value = 3;
                    w.setStatus("", "info");
                  }
                }}
              >
                {isJoin ? "完成" : "下一步"}
              </button>
            ) : (
              <>
                <button
                  class="btn btn-primary"
                  type="button"
                  disabled={w.isBusy.value}
                  onClick={w.handleSyncNow}
                >
                  开始同步
                </button>
                <button
                  class="btn btn-secondary"
                  type="button"
                  disabled={w.isBusy.value}
                  onClick={w.handleSyncLater}
                >
                  稍后同步
                </button>
              </>
            )}
          </WizardFooter>
        </>
      );
    };
  },
});
