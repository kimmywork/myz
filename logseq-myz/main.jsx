import { createApp } from "vue";
import App from "./App.jsx";
import "./styles.css";
import "@logseq/libs";

const main = () => {
  const container = document.getElementById("app");
  if (!container) {
    console.error("Popup mount point not found");
    return;
  }
  const app = createApp(App);
  app.mount(container);

  logseq.UI.showMsg("Popup loaded", "success");

  logseq.provideModel({
    openMyzDashboard() {
      logseq.showMainUI({ autoFocus: true });
    }
  });

  logseq.App.registerUIItem('toolbar', {
    key: "myz-show-dashboard",
    template: `
      <a style="font-size: 20px" class="button" data-on-click="openMyzDashboard">
        📺
      </a>
    `,
  });
};

logseq.ready(main).catch(console.error);