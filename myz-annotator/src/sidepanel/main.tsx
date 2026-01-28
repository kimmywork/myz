import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.jsx";

const app = createApp(App);
app.use(createPinia());
app.mount("#app");
