import { ensureCjkFonts } from "@myz/shared/fonts";
import { createApp } from "vue";
import "@myz/shared/theme";
import "@myz/shared/colorScheme";
import PdfReaderApp from "./PdfReaderApp.js";
import { pinia } from "./stores/pinia.js";
import "./pdf-viewer.css";

ensureCjkFonts();

createApp(PdfReaderApp).use(pinia).mount("#app");
