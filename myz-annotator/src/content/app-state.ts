import { createApp } from "vue";
import App from "./app.tsx";
import { createShadowHost } from "./shadow-dom.ts";
import { pinia } from "./stores/pinia.ts";
import { setThemeRoot } from "./theme-root.ts";

export function mountApp() {
  const { host, mountPoint } = createShadowHost();
  setThemeRoot(mountPoint);

  const app = createApp(App);
  app.use(pinia);
  const instance = app.mount(mountPoint);
  return {
    host,
    mountPoint,
    instance,
  };
}
