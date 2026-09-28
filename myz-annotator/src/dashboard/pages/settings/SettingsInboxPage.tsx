import { SettingsRow } from "@myz/dashboard-ui";
import { defineComponent, ref, watchEffect } from "vue";
import ToggleSwitch from "../../components/ToggleSwitch.jsx";
import { useSettingsStore } from "../../stores/settings.js";

export default defineComponent({
  name: "SettingsInboxPage",
  setup() {
    const store = useSettingsStore();
    const enabled = ref(true);

    watchEffect(() => {
      enabled.value = store.settings.inboxEnabled !== false;
    });

    async function setEnabled(next: boolean) {
      enabled.value = next;
      await store.saveSettings({ inboxEnabled: next });
    }

    return () => (
      <section class="space-y-4">
        <div>
          <h3 class="text-title font-semibold text-text">
            采集处理队列（Inbox）
          </h3>
          <p class="text-compact text-muted">
            Inbox 是新采集内容的处理队列。关闭后新采集直接进入文库常规视图，
            不再产生待处理记录；已有的待处理/稍后记录会保留。
          </p>
        </div>
        <SettingsRow
          label="启用 Inbox"
          hint="新采集默认进入待处理队列"
          controlWidth="auto"
        >
          <ToggleSwitch
            checked={enabled.value}
            ariaLabel="启用 Inbox"
            onChange={(event: Event) =>
              void setEnabled((event.target as HTMLInputElement).checked)
            }
          />
        </SettingsRow>
      </section>
    );
  },
});
