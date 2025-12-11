import { defineComponent, ref, reactive, onBeforeUnmount } from "vue";
import type { HTMLAttributes, Ref } from "vue";

const HIDE_ANIMATION_DURATION = 240;

function buildToastStyle(visible: boolean): HTMLAttributes["style"] {
  return {
    maxWidth: "280px",
    padding: "12px 14px",
    borderRadius: "12px",
    background: "rgba(15, 23, 42, 0.95)",
    color: "#f8fafc",
    fontSize: "13px",
    boxShadow: "0 18px 32px rgba(15, 23, 42, 0.4)",
    opacity: visible ? "1" : "0",
    transform: visible ? "translateY(0)" : "translateY(-6px)",
    transition: "opacity 0.25s ease, transform 0.25s ease",
    pointerEvents: "auto",
  };
}

export interface Notification {
  id: string;
  message: string;
  visible: boolean;
  hideTimer: ReturnType<typeof setTimeout> | null;
  removeTimer: ReturnType<typeof setTimeout> | null;
}

export interface NotifyOptions {
  message: string;
  duration?: number;
}

export default defineComponent({
  name: "MyZNotifications",
  setup(_, { expose }) {
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

    onBeforeUnmount(() => {
      notifications.value.forEach((entry) => {
        if (entry.hideTimer) {
          clearTimeout(entry.hideTimer);
        }
        if (entry.removeTimer) {
          clearTimeout(entry.removeTimer);
        }
      });
    });

    expose({ notify });

    return () => {
      if (!notifications.value.length) {
        return null;
      }
      return (
        <div
          class="myz-toast-container"
          style={{
            position: "fixed",
            top: "16px",
            right: "16px",
            zIndex: "2147483646",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            alignItems: "flex-end",
            pointerEvents: "none",
          }}
        >
          {notifications.value.map((toast) => (
            <div
              key={toast.id}
              class="myz-toast"
              style={buildToastStyle(toast.visible)}
            >
              {toast.message}
            </div>
          ))}
        </div>
      );
    };
  },
});
