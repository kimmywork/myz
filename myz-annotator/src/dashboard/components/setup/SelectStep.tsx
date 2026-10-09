import { defineComponent } from "vue";
import type { PropType } from "vue";
import type { SetupWizardApi } from "./useSetupWizard.js";
import type { Scenario } from "./wizard-types.js";

interface ScenarioOption {
  key: Scenario;
  title: string;
  desc: string;
  enabled: boolean;
  note: string;
}

/** Step 0 — pick join / create / authorize. */
export default defineComponent({
  name: "SetupSelectStep",
  props: {
    wizard: { type: Object as PropType<SetupWizardApi>, required: true },
  },
  setup(props) {
    return () => {
      const w = props.wizard;
      const configured = w.hasAccount.value;
      const options: ScenarioOption[] = [
        {
          key: "join",
          title: "加入已有账号",
          desc: "这是一台新设备，从已有设备获取邀请并加入。",
          enabled: !configured,
          note: configured ? "本机已配置同步账号" : "",
        },
        {
          key: "create",
          title: "新建账号",
          desc: "这是第一台设备，创建加密同步账号并上传本机数据。",
          enabled: !configured,
          note: configured ? "本机已配置同步账号" : "",
        },
        {
          key: "authorize",
          title: "给新设备授权",
          desc: "本机已有账号，为另一台新设备生成配对邀请并批准。",
          enabled: configured,
          note: configured ? "" : "请先在已有设备上创建账号",
        },
      ];
      return (
        <div class="grid gap-3">
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              disabled={!option.enabled}
              class="flex flex-col gap-1 rounded-panel border border-line bg-surface p-4 text-left transition hover:border-accent disabled:pointer-events-none disabled:opacity-50"
              onClick={() => w.startScenario(option.key)}
            >
              <span class="text-title font-semibold text-text">
                {option.title}
              </span>
              <span class="text-caption text-muted">{option.desc}</span>
              {option.note ? (
                <span class="text-caption text-warn">{option.note}</span>
              ) : null}
            </button>
          ))}
        </div>
      );
    };
  },
});
