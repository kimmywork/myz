import { createApp } from "vue";
import App from "./App.jsx";
import { pinia } from "./stores/pinia.js";
import "./styles.css";

const mountApp = () => {
  const container = document.getElementById("app");
  if (!container) {
    console.error("Dashboard mount point not found");
    return;
  }
  const app = createApp(App);
  app.use(pinia);
  app.mount(container);
};

document.addEventListener("DOMContentLoaded", mountApp, { once: true });
