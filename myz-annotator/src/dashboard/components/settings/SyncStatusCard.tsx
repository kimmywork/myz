import { Button, SettingsRow } from "@myz/dashboard-ui";
import { defineComponent } from "vue";
import type { PropType } from "vue";
import type { SyncSectionApi } from "./useSyncSection.js";

/** Account status summary + primary actions. */
export default defineComponent({
  name: "SyncStatusCard",
  props: {
    api: { type: Object as PropType<SyncSectionApi>, required: true },
  },
  setup(props) {
    return () => {
      const a = props.api;
      return (
        <>
          <div class="grid gap-4 rounded-control border border-line bg-surface p-4 dark:border-line dark:bg-surface-2">
            <SettingsRow label="同步账号" controlWidth="auto">
              <span class="flex items-center gap-2">
                <span class="text-caption text-muted">
                  {a.hasAccount.value ? "已建立" : "未建立"}
                </span>
                {a.hasAccount.value && !a.lastSyncAt.value ? (
                  <span class="rounded-full border border-info px-2 py-0.5 text-tag uppercase tracking-wide text-info">
                    未完成同步
                  </span>
                ) : null}
              </span>
            </SettingsRow>
            {a.hasAccount.value ? (
              <SettingsRow label="Account ID" controlWidth="auto">
                <span class="text-caption text-muted break-all">
                  {a.accountId.value}
                </span>
              </SettingsRow>
            ) : null}
            {a.hasAccount.value ? (
              <SettingsRow label="Device ID" controlWidth="auto">
                <span class="text-caption text-muted break-all">
                  {a.deviceId.value || "-"}
                </span>
              </SettingsRow>
            ) : null}
            {a.hasAccount.value ? (
              <SettingsRow label="Epoch" controlWidth="auto">
                <span class="text-caption text-muted">
                  {a.accountEpoch.value}
                </span>
              </SettingsRow>
            ) : null}
            <SettingsRow label="上次同步" controlWidth="auto">
              <span class="text-caption text-muted">
                {a.lastSyncAt.value || "未同步"}
              </span>
            </SettingsRow>
          </div>

          <div class="flex flex-wrap gap-3 border-t border-line pt-3">
            {!a.hasAccount.value ? (
              <Button
                variant="primary"
                disabled={a.isBusy.value}
                onClick={() => a.openSetup()}
              >
                设置同步
              </Button>
            ) : (
              <>
                <Button disabled={a.isBusy.value} onClick={a.handleSyncNow}>
                  立即同步
                </Button>
                <Button
                  disabled={a.isBusy.value}
                  onClick={() => a.openSetup("authorize")}
                >
                  添加设备
                </Button>
                <Button
                  variant="danger"
                  disabled={a.isBusy.value}
                  onClick={a.handleClearAccount}
                >
                  解除账号
                </Button>
              </>
            )}
          </div>
        </>
      );
    };
  },
});
