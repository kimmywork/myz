import { Check, Loader2, TriangleAlert } from "@lucide/vue";
import { defineComponent } from "vue";
import type { PropType } from "vue";
import { Notice, OutputBlock, WizardFooter } from "../primitives.jsx";
import SetupS3Fields, { setupInputClass } from "../SetupS3Fields.jsx";
import type { SetupWizardApi } from "../useSetupWizard.js";
import S3Step from "./S3Step.jsx";
import SyncStep from "./SyncStep.jsx";

function MigrationStep({ w }: { w: SetupWizardApi }) {
  const hasLegacy = w.legacyKeysetPresent.value;
  return (
    <>
      <div class="grid gap-3">
        <Notice>
          若你以前用旧格式同步过，这里会把旧云端记录一次性合并到新账号，然后清理旧密钥。
        </Notice>
        {hasLegacy ? (
          <>
            <label class="flex flex-col gap-1.5">
              <span class="text-caption font-medium text-text">
                旧同步密钥（可选，留空则用本机已保存的旧密钥）
              </span>
              <input
                type="password"
                class={setupInputClass}
                aria-label="旧同步密钥"
                placeholder="仅保留在本地"
                value={w.legacySecret.value}
                onInput={(event: InputEvent) =>
                  (w.legacySecret.value = (
                    event.target as HTMLInputElement
                  ).value)
                }
              />
            </label>
            <label class="flex items-center gap-2 text-caption text-text">
              <input
                type="checkbox"
                checked={w.showOldS3.value}
                onChange={(event: Event) =>
                  (w.showOldS3.value = (
                    event.target as HTMLInputElement
                  ).checked)
                }
              />
              旧 S3 与上面不同？展开单独填写
            </label>
            {w.showOldS3.value ? (
              <SetupS3Fields
                value={w.oldS3}
                disabled={w.isBusy.value}
                onUpdate={(field, value) => {
                  w.oldS3[field] = value;
                }}
              />
            ) : null}
            {w.migrationDone.value ? (
              <Notice tone="success" icon={Check}>
                已合并 {w.rescuedCount.value} 条旧记录
              </Notice>
            ) : null}
            <Notice tone="warn" icon={TriangleAlert}>
              迁移失败可重试；也可继续（仅旧云端记录可能丢失）。
            </Notice>
          </>
        ) : (
          <Notice>未检测到旧格式数据，无需迁移。可直接继续。</Notice>
        )}
      </div>
      <WizardFooter wizard={w}>
        {!hasLegacy ? (
          <button
            class="btn btn-primary"
            type="button"
            disabled={w.isBusy.value}
            onClick={() => {
              w.skipMigration();
              w.step.value = 2;
              w.setStatus("", "info");
            }}
          >
            下一步
          </button>
        ) : w.migrationDone.value ? (
          <button
            class="btn btn-primary"
            type="button"
            disabled={w.isBusy.value}
            onClick={() => {
              w.step.value = 2;
              w.setStatus("", "info");
            }}
          >
            下一步
          </button>
        ) : (
          <>
            <button
              class="btn"
              type="button"
              disabled={w.isBusy.value}
              onClick={w.handleMigrate}
            >
              迁移
            </button>
            <button
              class="btn btn-secondary"
              type="button"
              disabled={w.isBusy.value}
              onClick={() => {
                w.step.value = 2;
                w.setStatus("", "info");
              }}
            >
              跳过
            </button>
          </>
        )}
      </WizardFooter>
    </>
  );
}

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
      if (w.step.value === 1) return <MigrationStep w={w} />;
      if (w.step.value === 2) return <CreateAccountStep w={w} />;
      if (w.step.value === 3) return <SyncStep wizard={w} />;
      return <DoneStep w={w} />;
    };
  },
});
