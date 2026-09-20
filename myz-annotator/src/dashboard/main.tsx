import { ensureCjkFonts } from "@myz/shared/fonts";
import { createApp } from "vue";
import App from "./App.jsx";
import { router } from "./router.js";
import { pinia } from "./stores/pinia.js";
import "./styles.css";

ensureCjkFonts();

const mountApp = () => {
  const container = document.getElementById("app");
  if (!container) {
    console.error("Dashboard mount point not found");
    return;
  }
  const app = createApp(App);
  app.use(pinia);
  app.use(router);
  app.mount(container);
};

document.addEventListener("DOMContentLoaded", mountApp, { once: true });
