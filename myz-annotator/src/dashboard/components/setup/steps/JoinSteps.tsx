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
import SyncStep from "./SyncStep.jsx";

const pasteClass = `${setupInputClass} font-mono text-tag`;

/** Branch A — join an existing account from a new device. */
export default defineComponent({
  name: "SetupJoinSteps",
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
            hint="邀请串会自动带入服务器地址；Access Key / Secret 需要你自行填写。测试通过后才能继续。"
          />
        );
      }
      if (w.step.value === 1) {
        return (
          <>
            <div class="grid gap-3">
              <Notice>
                请在【已有设备】上：设置 → 加密同步 → 添加新设备 →
                生成配对邀请，然后把邀请串发给我。
              </Notice>
              <label class="flex flex-col gap-1.5">
                <span class="text-caption font-medium text-text">邀请串</span>
                <textarea
                  rows={4}
                  aria-label="邀请串"
                  class={pasteClass}
                  placeholder="粘贴邀请串…"
                  value={w.pairingInviteInput.value}
                  onInput={(event: Event) =>
                    (w.pairingInviteInput.value = (
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
                disabled={w.isBusy.value || !w.pairingInviteInput.value.trim()}
                onClick={w.handleAcceptInvite}
              >
                {w.isBusy.value ? (
                  <Loader2 size={15} class="animate-spin" aria-hidden="true" />
                ) : null}
                解析邀请
              </button>
            </WizardFooter>
          </>
        );
      }
      if (w.step.value === 2) {
        return (
          <>
            <div class="grid gap-3">
              <SasDisplay label="本机短码：" sas={w.pairingGuestSas.value} />
              <Notice tone="warn" icon={ShieldCheck}>
                把响应串发回已有设备；已有设备会显示它的短码，两边必须一致。
              </Notice>
              <OutputBlock
                label="响应串"
                text={w.pairingResponse.value}
                copied={w.copied.value}
                onCopy={w.copyText}
              />
            </div>
            <WizardFooter wizard={w}>
              <button
                class="btn btn-primary"
                type="button"
                disabled={w.isBusy.value}
                onClick={() => {
                  w.step.value = 3;
                  w.setStatus("", "info");
                }}
              >
                下一步
              </button>
            </WizardFooter>
          </>
        );
      }
      if (w.step.value === 3) {
        return (
          <>
            <div class="grid gap-3">
              <Notice>已有设备批准后会给你一串【配对串】。粘贴到下面。</Notice>
              <label class="flex flex-col gap-1.5">
                <span class="text-caption font-medium text-text">配对串</span>
                <textarea
                  rows={4}
                  aria-label="配对串"
                  class={pasteClass}
                  placeholder="粘贴配对串…"
                  value={w.pairingImportInput.value}
                  onInput={(event: Event) =>
                    (w.pairingImportInput.value = (
                      event.target as HTMLTextAreaElement
                    ).value)
                  }
                />
              </label>
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
                我已确认：已有设备短码与本机一致（
                {w.pairingGuestSas.value || "——"}）
              </label>
            </div>
            <WizardFooter wizard={w}>
              <button
                class="btn btn-primary"
                type="button"
                disabled={
                  w.isBusy.value ||
                  !w.sasConfirmed.value ||
                  !w.pairingImportInput.value.trim()
                }
                onClick={w.handleImportAccount}
              >
                完成加入
              </button>
            </WizardFooter>
          </>
        );
      }
      return <SyncStep wizard={w} />;
    };
  },
});
