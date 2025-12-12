import { App, createApp } from "vue";
import Notifications, {
  type NotifyOptions,
} from "./components/Notifications.tsx";
import { createShadowHost } from "./shadow-dom.ts";

const NOTIFICATION_DEFAULT_DURATION = 6000;
const notifications = mountNotifications();

function mountNotifications() {
  const { host, mountPoint } = createShadowHost();

  const app: App = createApp(Notifications);
  const instance = app.mount(mountPoint) as InstanceType<typeof Notifications>;

  return {
    host,
    notify: (options: NotifyOptions) => instance.notify(options),
  };
}

export function showNotification(
  message: string,
  duration: number = NOTIFICATION_DEFAULT_DURATION,
) {
  if (!message) {
    return;
  }
  notifications.notify?.({ message, duration });
}
