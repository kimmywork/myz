import { SettingsGroup } from "@myz/dashboard-ui";
import { defineComponent } from "vue";
import SyncAdvancedSettings from "./SyncAdvancedSettings.jsx";
import SyncStatusCard from "./SyncStatusCard.jsx";
import { useSyncSection } from "./useSyncSection.js";

/** Encrypted-sync settings section (status + actions + advanced). */
export default defineComponent({
  name: "SyncSection",
  setup() {
    const api = useSyncSection();
    return () => (
      <SettingsGroup
        title="加密同步"
        hint={
          api.hasAccount.value
            ? "已使用新格式设备绑定账号同步；旧格式密钥与 KeyId 不再需要。"
            : "仅密文存储到 S3。旧格式密钥仅用于迁移旧数据，新格式账号使用设备绑定。"
        }
      >
        <SyncStatusCard api={api} />
        <SyncAdvancedSettings api={api} />

        <p
          class={[
            "status-line",
            api.tone.value === "error"
              ? " status-line--error"
              : api.tone.value === "success"
                ? " status-line--success"
                : "",
          ].join(" ")}
        >
          {api.status.value}
        </p>
      </SettingsGroup>
    );
  },
});
