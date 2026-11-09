import { defineStore } from "pinia";
import { Ref, ref, reactive, computed } from "vue";

const HIDE_ANIMATION_DURATION = 240;
/** Ordinary notices fade after 4s; undo affordances keep the 6s window. */
const DEFAULT_DURATION = 4000;

/** One text action on a notice ("撤销"); a notice carries at most one. */
export interface NotificationAction {
  label: string;
  /** Runs after the notice is removed, so the UI never lags behind. */
  onClick: () => void;
}

/** Options for {@link useNotificationStore}'s `notify`. */
export interface NotifyOptions {
  message: string;
  duration?: number;
  /** At most one text action ("撤销") per notice, per §4.15. */
  action?: NotificationAction;
  /**
   * Called when the notice's countdown is frozen (hover/focus). Lets a feature
   * that owns a parallel timer — such as a deferred delete — pause with it.
   */
  onPause?: () => void;
  /** Called when the frozen countdown resumes. */
  onResume?: () => void;
}

/** A visible toast: message, optional action, countdown state and timers. */
export interface Notification {
  id: string;
  message: string;
  action: NotificationAction | null;
  onPause: (() => void) | null;
  onResume: (() => void) | null;
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

/** Content-layer toast queue: notices, countdowns and their text actions. */
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

  /** Removes a notice immediately, clearing both of its animation timers. */
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
    entry.onPause?.();
  }

  /** Resumes a paused countdown with the time that was left. */
  function resume(id: string) {
    const entry = find(id);
    if (!entry || !entry.visible) return;
    if (entry.hideTimer || entry.removeTimer) return;
    scheduleRemoval(entry, entry.remaining);
    entry.onResume?.();
  }

  /**
   * Takes the notice down first, then runs its text action, so an undo never
   * leaves a stale button on screen. Unknown or actionless ids are a no-op.
   */
  function triggerAction(id: string) {
    const entry = find(id);
    if (!entry?.action) return;
    const action = entry.action;
    removeNotification(id);
    action.onClick();
  }

  /** Shows a notice; `duration` defaults to 4s, undo notices pass 6s. */
  function notify({
    message,
    duration = DEFAULT_DURATION,
    action,
    onPause,
    onResume,
  }: Partial<NotifyOptions> = {}): NotificationHandle | null {
    if (!message) {
      return null;
    }
    const entry = reactive<Notification>({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      message,
      action: action ?? null,
      onPause: onPause ?? null,
      onResume: onResume ?? null,
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
    /** Shows a notice and returns a handle that can take it down early. */
    notify,
    /** Freezes a notice's countdown and any feature timer tied to it. */
    pause,
    /** Resumes a notice's countdown. Unknown or hidden ids are a no-op. */
    resume,
    /** Removes a notice and runs its text action, in that order. */
    triggerAction,
    /** Takes a notice down without running its action. */
    dismiss: removeNotification,
    notifications: computed(() => notifications.value),
  };
});
