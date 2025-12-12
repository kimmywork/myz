import contentStyles from "./content.css?raw";

declare global {
  interface Window {
    contentStyleElement: HTMLStyleElement | null;
  }
}

window.contentStyleElement = null;

export function ensureContentStyles() {
  const existing = document.querySelector(
    'style[data-myz-annotator-style="1"]',
  );
  if (existing) {
    window.contentStyleElement = existing as HTMLStyleElement;
    return existing;
  }
  const style = document.createElement("style");
  style.setAttribute("data-myz-annotator-style", "1");
  style.textContent = contentStyles;
  document.head.appendChild(style);
  window.contentStyleElement = style;
  return style;
}
