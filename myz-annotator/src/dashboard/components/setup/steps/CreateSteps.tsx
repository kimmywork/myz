import { Check, Loader2, TriangleAlert } from "@lucide/vue";
import { defineComponent } from "vue";
import type { PropType } from "vue";
import { Notice, OutputBlock, WizardFooter } from "../primitives.jsx";
import type { SetupWizardApi } from "../useSetupWizard.js";
import S3Step from "./S3Step.jsx";
import SyncStep from "./SyncStep.jsx";

function CreateAccountStep({ w }: { w: SetupWizardApi }) {
  return (
    <>
      <div class="grid gap-3">
        <Notice tone="warn" icon={TriangleAlert}>
          无 A-only 恢复：请保留至少一台已授权设备；设备全丢则数据不可恢复。
        </Notice>
        {w.createdAccountId.value ? (
          <OutputBlock
            label="Account ID"
            text={w.createdAccountId.value}
            copied={w.copied.value}
            onCopy={w.copyText}
          />
        ) : (
          <button
            class="btn btn-primary self-start"
            type="button"
            disabled={w.isBusy.value}
            onClick={w.handleCreateAccount}
          >
            {w.isBusy.value ? (
              <Loader2 size={15} class="animate-spin" aria-hidden="true" />
            ) : null}
            创建同步账号
          </button>
        )}
      </div>
      <WizardFooter wizard={w}>
        <button
          class="btn btn-primary"
          type="button"
          disabled={w.isBusy.value || !w.createdAccountId.value}
          onClick={() => {
            w.step.value = 2;
            w.setStatus("", "info");
          }}
        >
          下一步
        </button>
      </WizardFooter>
    </>
  );
}

function DoneStep({ w }: { w: SetupWizardApi }) {
  const done = w.syncState.value === "done";
  return (
    <>
      <div class="grid gap-3">
        <Notice
          tone={done ? "success" : "warn"}
          icon={done ? Check : TriangleAlert}
        >
          {done
            ? "账号已建立并完成首次同步。"
            : "账号已建立，但尚未完成首次同步。可稍后在设置页同步。"}
        </Notice>
        {w.accountId.value ? (
          <OutputBlock
            label="Account ID"
            text={w.accountId.value}
            copied={w.copied.value}
            onCopy={w.copyText}
          />
        ) : null}
      </div>
      <WizardFooter wizard={w}>
        <button
          class="btn"
          type="button"
          onClick={() => w.startScenario("authorize")}
        >
          添加新设备
        </button>
        <button class="btn btn-primary" type="button" onClick={w.finish}>
          完成
        </button>
      </WizardFooter>
    </>
  );
}

/** Branch B — create a new account on this device. */
export default defineComponent({
  name: "SetupCreateSteps",
  props: {
    wizard: { type: Object as PropType<SetupWizardApi>, required: true },
  },
  setup(props) {
    return () => {
      const w = props.wizard;
      if (w.step.value === 0) {
        return (
          <S3Step
            wizard={w}
            hint="仅密文上传到 S3。Endpoint 必须是 https://（仅 localhost/127.0.0.1 可用 http）。测试通过后才能继续。"
          />
        );
      }
      if (w.step.value === 1) return <CreateAccountStep w={w} />;
      if (w.step.value === 2) return <SyncStep wizard={w} />;
      return <DoneStep w={w} />;
    };
  },
});
