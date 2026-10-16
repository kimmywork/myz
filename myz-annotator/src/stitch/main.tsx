import { ensureCjkFonts } from "@myz/shared/fonts";
import { createApp } from "vue";
import "@myz/shared/theme";
import "@myz/shared/colorScheme";
import StitchApp from "./StitchApp.js";
import { pinia } from "./stores/pinia.js";
import "./stitch-viewer.css";

ensureCjkFonts();

createApp(StitchApp).use(pinia).mount("#app");
