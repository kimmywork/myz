import { defineComponent, onBeforeUnmount } from "vue";
import type { HTMLAttributes } from "vue";
import { useNotificationStore } from "../stores/notification-store";

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

export default defineComponent({
  name: "MyZNotifications",
  setup() {
    const store = useNotificationStore();
    onBeforeUnmount(() => {
      store.notifications.forEach((entry) => {
        if (entry.hideTimer) {
          clearTimeout(entry.hideTimer);
        }
        if (entry.removeTimer) {
          clearTimeout(entry.removeTimer);
        }
      });
    });

    return () => {
      if (!store.notifications.length) {
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
          {store.notifications.map((toast) => (
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
