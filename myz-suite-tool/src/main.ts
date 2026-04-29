import { createApp } from "vue";
import App from "./App.tsx";
import router from "./router";
import { pinia } from "./stores/pinia";
import "./styles.css";

createApp(App).use(pinia).use(router).mount("#app");
