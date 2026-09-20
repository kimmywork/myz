/**
 * Tiny channel for the shadow mount point, kept free of app imports so content
 * features (zen mode) can read resolved `--myz-*` values without creating a
 * dependency cycle with the Vue app.
 */
let themeRoot: HTMLElement | null = null;

export function setThemeRoot(element: HTMLElement | null): void {
  themeRoot = element;
}

export function getThemeRoot(): HTMLElement | null {
  return themeRoot;
}
