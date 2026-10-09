import { SettingsRow } from "@myz/dashboard-ui";
import { defineComponent } from "vue";
import type { PropType } from "vue";
import ToggleSwitch from "../ToggleSwitch.jsx";
import type { SyncSectionApi } from "./useSyncSection.js";

type Ref = { value: string };

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
            {!a.hasAccount.value ? (
              <SettingsRow label="同步密钥">
                {input(a.syncSecret, {
                  type: "password",
                  placeholder: "仅保留在本地",
                })}
              </SettingsRow>
            ) : null}
            {!a.hasAccount.value ? (
              <SettingsRow label="当前 KeyId" controlWidth="auto">
                <span class="text-caption text-muted">
                  {a.keyId.value || "未设置"}
                </span>
              </SettingsRow>
            ) : null}
            {!a.hasAccount.value ? (
              <SettingsRow label="同步版本" controlWidth="auto">
                <span class="text-caption text-muted">
                  {a.lastManifestVersion.value || 0}
                </span>
              </SettingsRow>
            ) : null}
            {!a.hasAccount.value ? (
              <SettingsRow label="密钥更新时间" controlWidth="auto">
                <span class="text-caption text-muted">
                  {a.keyUpdatedAt.value || "-"}
                </span>
              </SettingsRow>
            ) : null}
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
              {!a.hasAccount.value ? (
                <button
                  class="btn"
                  type="button"
                  disabled={a.isBusy.value}
                  onClick={a.handleSetKey}
                >
                  设置密钥
                </button>
              ) : null}
            </div>
          </div>
        </details>
      );
    };
  },
});
