import { createApp } from "vue";
import App from "./app.tsx";
import { createShadowHost } from "./shadow-dom.ts";
import { pinia } from "./stores/pinia.ts";

export function mountApp() {
  const { host, mountPoint } = createShadowHost();

  const app = createApp(App);
  app.use(pinia);
  const instance = app.mount(mountPoint);
  return {
    host,
    mountPoint,
    instance,
  };
}
