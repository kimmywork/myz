import contentStyles from "./styles/content.css?raw";

export function createShadowHost(tag = "div", styles = contentStyles) {
  const host = document.createElement(tag);
  host.setAttribute("data-myz-host", "1");
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = contentStyles;
  shadow.appendChild(style);
  const mountPoint = document.createElement("div");
  shadow.appendChild(mountPoint);
  document.documentElement.appendChild(host);
  return { host, shadow, mountPoint };
}
