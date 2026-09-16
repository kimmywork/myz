import { createApp } from "vue";
import PdfReaderApp from "./PdfReaderApp.js";
import { pinia } from "./stores/pinia.js";
import "./pdf-viewer.css";

createApp(PdfReaderApp).use(pinia).mount("#app");
