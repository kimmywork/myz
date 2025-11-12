import { createApp } from "vue";
import App from "./App.jsx";
import "./styles.css";

const mountApp = () => {
  const container = document.getElementById("app");
  if (!container) {
    console.error("Dashboard mount point not found");
    return;
  }
  const app = createApp(App);
  app.mount(container);
};

document.addEventListener("DOMContentLoaded", mountApp, { once: true });
