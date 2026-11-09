import { defineComponent, onBeforeUnmount } from "vue";
import type { HTMLAttributes } from "vue";
import { useNotificationStore } from "@/content/stores/notification-store";

function buildToastStyle(visible: boolean): HTMLAttributes["style"] {
  return {
    maxWidth: "280px",
    padding: "12px 14px",
    borderRadius: "var(--myz-r)",
    background: "var(--myz-overlay)",
    color: "var(--myz-overlay-text)",
    fontSize: "13px",
    boxShadow: "var(--myz-shadow)",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    opacity: visible ? "1" : "0",
    transform: visible ? "translateY(0)" : "translateY(-6px)",
    transition:
      "opacity var(--myz-motion-med) var(--myz-ease-out), transform var(--myz-motion-med) var(--myz-ease-out)",
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
              role="status"
              aria-live="polite"
              onMouseenter={() => store.pause(toast.id)}
              onMouseleave={() => store.resume(toast.id)}
              onFocusin={() => store.pause(toast.id)}
              onFocusout={(event: FocusEvent) => {
                const next = event.relatedTarget as Node | null;
                const current = event.currentTarget as HTMLElement;
                if (!next || !current.contains(next)) {
                  store.resume(toast.id);
                }
              }}
            >
              <span class="myz-toast__message">{toast.message}</span>
              {toast.action ? (
                <button
                  type="button"
                  class="myz-toast__action"
                  onClick={() => store.triggerAction(toast.id)}
                >
                  {toast.action.label}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      );
    };
  },
});
