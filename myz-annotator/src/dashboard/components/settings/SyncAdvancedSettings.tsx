import { SettingsRow } from "@myz/dashboard-ui";
import { defineComponent } from "vue";
import type { PropType } from "vue";
import ToggleSwitch from "../ToggleSwitch.jsx";
import type { SyncSectionApi } from "./useSyncSection.js";

type Ref = { value: string };
type NumRef = { value: number };

/** Collapsible advanced S3 / legacy-key configuration. */
export default defineComponent({
  name: "SyncAdvancedSettings",
  props: {
    api: { type: Object as PropType<SyncSectionApi>, required: true },
  },
  setup(props) {
    const input = (
      target: Ref,
      extra: { type?: string; placeholder?: string } = {},
    ) => (
      <input
        type={extra.type || "text"}
        placeholder={extra.placeholder}
        value={target.value}
        onInput={(event: InputEvent) =>
          (target.value = (event.target as HTMLInputElement).value)
        }
      />
    );

    const numberInput = (
      target: NumRef,
      extra: { min?: number; max?: number; step?: number } = {},
    ) => (
      <input
        type="number"
        min={extra.min}
        max={extra.max}
        step={extra.step}
        value={String(target.value)}
        onInput={(event: InputEvent) => {
          const next = Number((event.target as HTMLInputElement).value);
          if (Number.isFinite(next)) target.value = next;
        }}
      />
    );

    return () => {
      const a = props.api;
      return (
        <details class="rounded-control border border-line bg-surface p-4 dark:border-line dark:bg-surface-2">
          <summary class="cursor-pointer text-compact font-medium text-text">
            高级设置
          </summary>
          <div class="mt-4 grid gap-4">
            <SettingsRow label="启用同步" controlWidth="auto">
              <ToggleSwitch
                checked={a.enabled.value}
                ariaLabel="启用同步"
                onChange={(event: Event) =>
                  (a.enabled.value = (event.target as HTMLInputElement).checked)
                }
              />
            </SettingsRow>
            <SettingsRow label="S3 Endpoint">
              {input(a.endpoint, {
                type: "url",
                placeholder: "https://s3.example.com",
              })}
            </SettingsRow>
            <SettingsRow label="Region">
              {input(a.region, { placeholder: "us-east-1" })}
            </SettingsRow>
            <SettingsRow label="Bucket">
              {input(a.bucket, { placeholder: "myz-sync" })}
            </SettingsRow>
            <SettingsRow label="Access Key ID">
              {input(a.accessKeyId)}
            </SettingsRow>
            <SettingsRow label="Secret Access Key">
              {input(a.secretAccessKey, { type: "password" })}
            </SettingsRow>
            <SettingsRow
              label="Session Token"
              hint="可选：S3 临时凭证（STS）需要"
            >
              {input(a.sessionToken)}
            </SettingsRow>
            <SettingsRow label="Prefix" hint="可选">
              {input(a.prefix, { placeholder: "myz-sync" })}
            </SettingsRow>
            <SettingsRow
              label="保留历史版本"
              hint="每个流保留的 manifest 数量，默认 30"
            >
              {numberInput(a.keepManifests, { min: 1, max: 365 })}
            </SettingsRow>
            <SettingsRow
              label="锁租约（毫秒）"
              hint="默认 30000；续租间隔为一半，范围 10000–300000"
            >
              {numberInput(a.lockLeaseMs, {
                min: 10_000,
                max: 300_000,
                step: 5_000,
              })}
            </SettingsRow>
            <div class="settings__actions">
              <button
                class="btn"
                type="button"
                disabled={a.isBusy.value}
                onClick={a.handleSaveSettings}
              >
                保存设置
              </button>
              <button
                class="btn"
                type="button"
                disabled={a.isBusy.value}
                onClick={a.handleTestConnection}
              >
                测试连接
              </button>
            </div>
          </div>
        </details>
      );
    };
  },
});
