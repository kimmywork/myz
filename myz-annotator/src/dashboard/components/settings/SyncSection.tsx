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
      <section class="settings__group">
        <div class="settings__group-header">
          <h3>加密同步</h3>
        </div>
        <div class="settings__fields">
          <p class="settings__hint">
            {api.hasAccount.value
              ? "已使用新格式设备绑定账号同步；旧格式密钥与 KeyId 不再需要。"
              : "仅密文存储到 S3。旧格式密钥仅用于迁移旧数据，新格式账号使用设备绑定。"}
          </p>

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
        </div>
      </section>
    );
  },
});
