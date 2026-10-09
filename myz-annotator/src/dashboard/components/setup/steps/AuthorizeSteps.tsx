import { Loader2, ShieldCheck } from "@lucide/vue";
import { defineComponent } from "vue";
import type { PropType } from "vue";
import {
  Notice,
  OutputBlock,
  SasDisplay,
  WizardFooter,
} from "../primitives.jsx";
import { setupInputClass } from "../SetupS3Fields.jsx";
import type { SetupWizardApi } from "../useSetupWizard.js";
import S3Step from "./S3Step.jsx";

const pasteClass = `${setupInputClass} font-mono text-tag`;

/** Branch C — authorize a new device from an already-configured device. */
export default defineComponent({
  name: "SetupAuthorizeSteps",
  props: {
    wizard: { type: Object as PropType<SetupWizardApi>, required: true },
  },
  setup(props) {
    return () => {
      const w = props.wizard;
      const offset = w.authorizeNeedsS3.value ? 1 : 0;
      if (offset === 1 && w.step.value === 0) {
        return (
          <S3Step
            wizard={w}
            hint="本机尚未完成 S3 配置，请先填写并测试连接。"
          />
        );
      }
      const local = w.step.value - offset;
      if (local === 0) {
        return (
          <>
            <div class="grid gap-3">
              <Notice>
                在【新设备】上打开设置同步向导，选择「加入已有账号」。
              </Notice>
              <button
                class="btn btn-primary self-start"
                type="button"
                disabled={w.isBusy.value}
                onClick={w.handleGenerateInvite}
              >
                {w.isBusy.value ? (
                  <Loader2 size={15} class="animate-spin" aria-hidden="true" />
                ) : null}
                生成配对邀请
              </button>
              {w.pairingInvite.value ? (
                <OutputBlock
                  label="邀请串"
                  text={w.pairingInvite.value}
                  copied={w.copied.value}
                  onCopy={w.copyText}
                />
              ) : null}
            </div>
            <WizardFooter wizard={w}>
              <button
                class="btn btn-primary"
                type="button"
                disabled={w.isBusy.value || !w.pairingInvite.value}
                onClick={() => {
                  w.step.value = offset + 1;
                  w.setStatus("", "info");
                }}
              >
                下一步
              </button>
            </WizardFooter>
          </>
        );
      }
      if (local === 1) {
        return (
          <>
            <div class="grid gap-3">
              <Notice>
                把【响应串】从新设备粘贴到这里，然后在下一步核对短码。
              </Notice>
              <label class="flex flex-col gap-1.5">
                <span class="text-caption font-medium text-text">响应串</span>
                <textarea
                  rows={4}
                  aria-label="响应串"
                  class={pasteClass}
                  placeholder="粘贴响应串…"
                  value={w.pairingResponseInput.value}
                  onInput={(event: Event) =>
                    (w.pairingResponseInput.value = (
                      event.target as HTMLTextAreaElement
                    ).value)
                  }
                />
              </label>
            </div>
            <WizardFooter wizard={w}>
              <button
                class="btn btn-primary"
                type="button"
                disabled={
                  w.isBusy.value || !w.pairingResponseInput.value.trim()
                }
                onClick={() => {
                  w.step.value = offset + 2;
                  w.setStatus("", "info");
                }}
              >
                下一步
              </button>
            </WizardFooter>
          </>
        );
      }
      return (
        <>
          <div class="grid gap-3">
            {w.pairingHostSas.value ? (
              <SasDisplay label="本机短码：" sas={w.pairingHostSas.value} />
            ) : null}
            {!w.pairingRoster.value ? (
              <button
                class="btn btn-primary self-start"
                type="button"
                disabled={w.isBusy.value}
                onClick={w.handleApprove}
              >
                {w.isBusy.value ? (
                  <Loader2 size={15} class="animate-spin" aria-hidden="true" />
                ) : null}
                批准并加入设备
              </button>
            ) : null}
            {w.pairingRoster.value ? (
              <>
                <label class="flex items-center gap-2 text-compact text-text">
                  <input
                    type="checkbox"
                    checked={w.sasConfirmed.value}
                    onChange={(event: Event) =>
                      (w.sasConfirmed.value = (
                        event.target as HTMLInputElement
                      ).checked)
                    }
                  />
                  我已确认与新设备短码一致（{w.pairingHostSas.value}）
                </label>
                <Notice tone="warn" icon={ShieldCheck}>
                  批准后把【配对串】发回新设备，让它在向导里粘贴完成加入。
                </Notice>
                <OutputBlock
                  label="配对串"
                  text={w.pairingRoster.value}
                  copied={w.copied.value}
                  onCopy={w.copyText}
                />
              </>
            ) : null}
          </div>
          <WizardFooter wizard={w}>
            <button
              class="btn btn-primary"
              type="button"
              disabled={!w.pairingRoster.value || !w.sasConfirmed.value}
              onClick={w.finish}
            >
              完成
            </button>
          </WizardFooter>
        </>
      );
    };
  },
});
