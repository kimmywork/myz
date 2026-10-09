import { Loader2 } from "@lucide/vue";
import { defineComponent } from "vue";
import type { PropType } from "vue";
import { Notice, WizardFooter } from "../primitives.jsx";
import SetupS3Fields from "../SetupS3Fields.jsx";
import type { SetupWizardApi } from "../useSetupWizard.js";

/** Shared S3 configuration step with a test-connection gate. */
export default defineComponent({
  name: "SetupS3Step",
  props: {
    wizard: { type: Object as PropType<SetupWizardApi>, required: true },
    hint: { type: String, required: true },
  },
  setup(props) {
    return () => {
      const w = props.wizard;
      return (
        <>
          <div class="grid gap-3">
            <SetupS3Fields
              value={w.s3}
              disabled={w.isBusy.value}
              onUpdate={(field, value) => {
                w.s3[field] = value;
                w.s3Tested.value = false;
              }}
            />
            <Notice>{props.hint}</Notice>
          </div>
          <WizardFooter wizard={w}>
            <button
              class="btn"
              type="button"
              disabled={w.isBusy.value}
              onClick={w.handleTestConnection}
            >
              {w.isBusy.value ? (
                <Loader2 size={15} class="animate-spin" aria-hidden="true" />
              ) : null}
              测试连接
            </button>
            <button
              class="btn btn-primary"
              type="button"
              disabled={w.isBusy.value || !w.s3Tested.value}
              onClick={() => w.saveS3AndGo(1)}
            >
              下一步
            </button>
          </WizardFooter>
        </>
      );
    };
  },
});
