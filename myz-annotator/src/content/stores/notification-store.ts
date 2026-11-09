import { defineStore } from "pinia";
import { Ref, ref, reactive, computed } from "vue";

const HIDE_ANIMATION_DURATION = 240;
/** Ordinary notices fade after 4s; undo affordances keep the 6s window. */
const DEFAULT_DURATION = 4000;

export interface NotificationAction {
  label: string;
  onClick: () => void;
}

export interface NotifyOptions {
  message: string;
  duration?: number;
  /** At most one text action ("撤销") per notice, per §4.15. */
  action?: NotificationAction;
}

export interface Notification {
  id: string;
  message: string;
  action: NotificationAction | null;
  visible: boolean;
  /** Milliseconds left on the current countdown (shrinks while paused). */
  remaining: number;
  /** When the current countdown started; used to pause and resume. */
  startedAt: number;
  hideTimer: ReturnType<typeof setTimeout> | null;
  removeTimer: ReturnType<typeof setTimeout> | null;
}

/** Lets the caller take a notice down early (e.g. after the action runs). */
export interface NotificationHandle {
  dismiss: () => void;
}

export const useNotificationStore = defineStore("notification", () => {
  const notifications: Ref<Notification[]> = ref([]);

  function clearTimers(entry: Notification) {
    if (entry.hideTimer) {
      clearTimeout(entry.hideTimer);
      entry.hideTimer = null;
    }
    if (entry.removeTimer) {
      clearTimeout(entry.removeTimer);
      entry.removeTimer = null;
    }
  }

  function removeNotification(id: string) {
    const index = notifications.value.findIndex((item) => item.id === id);
    if (index === -1) {
      return;
    }
    const [entry] = notifications.value.splice(index, 1);
    if (entry) {
      clearTimers(entry);
    }
  }

  function scheduleRemoval(entry: Notification, duration: number) {
    entry.remaining = duration;
    entry.startedAt = Date.now();
    entry.hideTimer = setTimeout(() => {
      entry.hideTimer = null;
      entry.visible = false;
    }, duration);
    entry.removeTimer = setTimeout(() => {
      entry.removeTimer = null;
      removeNotification(entry.id);
    }, duration + HIDE_ANIMATION_DURATION);
  }

  function find(id: string) {
    return notifications.value.find((item) => item.id === id);
  }

  /** §4.15: hover/focus pauses the countdown so slow readers keep the action. */
  function pause(id: string) {
    const entry = find(id);
    if (!entry || !entry.visible) return;
    if (!entry.hideTimer && !entry.removeTimer) return;
    clearTimers(entry);
    entry.remaining = Math.max(
      0,
      entry.remaining - (Date.now() - entry.startedAt),
    );
  }

  function resume(id: string) {
    const entry = find(id);
    if (!entry || !entry.visible) return;
    if (entry.hideTimer || entry.removeTimer) return;
    scheduleRemoval(entry, entry.remaining);
  }

  /** Runs the notice's text action, then takes the notice down. */
  function triggerAction(id: string) {
    const entry = find(id);
    if (!entry?.action) return;
    const action = entry.action;
    removeNotification(id);
    action.onClick();
  }

  function notify({
    message,
    duration = DEFAULT_DURATION,
    action,
  }: Partial<NotifyOptions> = {}): NotificationHandle | null {
    if (!message) {
      return null;
    }
    const entry = reactive<Notification>({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      message,
      action: action ?? null,
      visible: false,
      remaining: duration,
      startedAt: 0,
      hideTimer: null,
      removeTimer: null,
    });
    notifications.value.push(entry);
    requestAnimationFrame(() => {
      entry.visible = true;
      scheduleRemoval(entry, duration);
    });
    return { dismiss: () => removeNotification(entry.id) };
  }

  return {
    notify,
    pause,
    resume,
    triggerAction,
    dismiss: removeNotification,
    notifications: computed(() => notifications.value),
  };
});
