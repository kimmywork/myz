import { ensureCjkFonts } from "@myz/shared/fonts";
import { createApp } from "vue";
import "@myz/shared/theme";
import "@myz/shared/colorScheme";
import EpubReaderApp from "./EpubReaderApp.js";
import { pinia } from "./stores/pinia.js";
import "./epub-viewer.css";

ensureCjkFonts();

createApp(EpubReaderApp).use(pinia).mount("#app");
