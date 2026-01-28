import { defineStore } from "pinia";
import { Ref, ref, reactive, computed } from "vue";

const HIDE_ANIMATION_DURATION = 240;

export interface NotifyOptions {
  message: string;
  duration?: number;
}

export interface Notification {
  id: string;
  message: string;
  visible: boolean;
  hideTimer: ReturnType<typeof setTimeout> | null;
  removeTimer: ReturnType<typeof setTimeout> | null;
}

export const useNotificationStore = defineStore("notification", () => {
  const notifications: Ref<Notification[]> = ref([]);

  function removeNotification(id: string) {
    const index = notifications.value.findIndex((item) => item.id === id);
    if (index === -1) {
      return;
    }
    const [entry] = notifications.value.splice(index, 1);
    if (entry?.hideTimer) {
      clearTimeout(entry.hideTimer);
    }
    if (entry?.removeTimer) {
      clearTimeout(entry.removeTimer);
    }
  }

  function scheduleRemoval(entry: Notification, duration: number) {
    entry.hideTimer = setTimeout(() => {
      entry.visible = false;
    }, duration);
    entry.removeTimer = setTimeout(() => {
      removeNotification(entry.id);
    }, duration + HIDE_ANIMATION_DURATION);
  }

  function notify({ message, duration = 6000 }: Partial<NotifyOptions> = {}) {
    if (!message) {
      return;
    }
    const entry = reactive({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      message,
      visible: false,
      hideTimer: null,
      removeTimer: null,
    });
    notifications.value.push(entry);
    requestAnimationFrame(() => {
      entry.visible = true;
      scheduleRemoval(entry, duration);
    });
  }

  return {
    notify,
    notifications: computed(() => notifications.value),
  };
});
