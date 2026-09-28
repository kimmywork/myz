import { SettingsRow } from "@myz/dashboard-ui";
import { defineComponent, ref, watchEffect } from "vue";
import ToggleSwitch from "../../components/ToggleSwitch.jsx";
import { useSettingsStore } from "../../stores/settings.js";

export default defineComponent({
  name: "SettingsInboxPage",
  setup() {
    const store = useSettingsStore();
    const enabled = ref(true);
    const reminderEnabled = ref(true);

    watchEffect(() => {
      enabled.value = store.settings.inboxEnabled !== false;
      reminderEnabled.value = store.settings.inboxReminderEnabled !== false;
    });

    async function setEnabled(next: boolean) {
      enabled.value = next;
      await store.saveSettings({ inboxEnabled: next });
    }

    async function setReminderEnabled(next: boolean) {
      reminderEnabled.value = next;
      await store.saveSettings({ inboxReminderEnabled: next });
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
        <SettingsRow
          label="每日清理提醒"
          hint="有待处理内容时每天提醒一次"
          controlWidth="auto"
        >
          <ToggleSwitch
            checked={reminderEnabled.value}
            ariaLabel="每日清理提醒"
            onChange={(event: Event) =>
              void setReminderEnabled(
                (event.target as HTMLInputElement).checked,
              )
            }
          />
        </SettingsRow>
      </section>
    );
  },
});
