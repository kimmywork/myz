/**
 * External AI chat targets for the toolbar's 解读 action.
 *
 * Everything provider-specific lives here so the background (tab resolution),
 * the content script (composer filling) and the dashboard (settings) share one
 * description. Add a provider by adding an entry: `available: false` keeps it
 * visible in settings while the composer adapter is still missing.
 *
 * Selectors are deliberately structural: both sites ship hashed class names and
 * localize their UI, so mode toggles are matched by label and everything else by
 * shape (see `content/ai-compose.ts`).
 */

export type AiProviderId = "deepseek" | "qwen";

/** A "deep thinking" style mode button to switch on before composing. */
export interface AiThinkToggle {
  /** Container selector for the app's toggle buttons. */
  selector: string;
  /** Label of the target mode, matched in every supported UI language. */
  label: RegExp;
  /** Label of the *other* mode, used to disambiguate a localized UI. */
  exclude?: RegExp;
}

export interface AiProvider {
  id: AiProviderId;
  /** Shown in the toolbar label and in settings. */
  label: string;
  origin: string;
  /** URL that starts a fresh conversation. */
  newChatUrl: string;
  /** Only tabs matching this are treated as chat tabs of the provider. */
  hostPattern: RegExp;
  /** Path pattern of the sign-in screen (no composer exists there). */
  loginPath: RegExp;
  /**
   * Paths that mean "fresh conversation". Several SPAs have more than one (a
   * draft/local route next to the root); all of them count as the same place for
   * reuse and for the "new chat" guard.
   */
  newChatPaths: RegExp[];
  /** Optional mode toggle enabled before composing. */
  thinkToggle?: AiThinkToggle;
  /**
   * Selectors for the app's "new chat" control, tried in order. Structural only
   * (hashed/semantic class names), never localized text: clicking it lets the SPA
   * swap conversations without a full page reload, which matters on sites that
   * boot slowly. Absent/unknown → the background falls back to navigating to
   * `newChatUrl` and waits for the new document.
   */
  newChatControl?: string[];
  /** False while the composer adapter is not wired up yet. */
  available: boolean;
}

export const AI_PROVIDERS: Record<AiProviderId, AiProvider> = {
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    origin: "https://chat.deepseek.com",
    newChatUrl: "https://chat.deepseek.com/",
    hostPattern: /^https:\/\/chat\.deepseek\.com(\/|$)/,
    loginPath: /\/(sign[_-]?in|login)/i,
    newChatPaths: [/^\/$/],
    thinkToggle: {
      selector: ".ds-toggle-button",
      label: /think|reason|深度|思考/i,
      exclude: /search|web|联网|搜索|全网/i,
    },
    available: true,
  },
  qwen: {
    id: "qwen",
    label: "Qwen",
    origin: "https://chat.qwen.ai",
    newChatUrl: "https://chat.qwen.ai/",
    hostPattern: /^https:\/\/chat\.qwen\.ai(\/|$)/,
    // `/auth` is the sign-in route (`/auth?action=signin`); conversations live
    // under `/c/:id`, so the root path remains the new-chat entry point.
    loginPath: /\/(auth|sign[_-]?in|login)(\/|$)/i,
    // "New chat" is not only `/`: the app also has draft routes under `/c/`
    // (taken from its bundle), and the sidebar button may land on one of them.
    newChatPaths: [/^\/$/, /^\/c\/(new-chat|local|guest)\/?$/i],
    // No mode toggle: Qwen's "Select Mode" is a localized tools menu (web
    // search / deep research / create image …), so composing leaves it alone.
    // Two different controls exist depending on the auth state: the landing page
    // has `.new-chat`, the signed-in sidebar has `.sidebar-entry-fixed-list-content`
    // (its aria-label is localized). Both route to `/` without a reload.
    newChatControl: [".sidebar-entry-fixed-list-content", ".new-chat"],
    available: true,
  },
};

export const AI_PROVIDER_IDS = Object.keys(AI_PROVIDERS) as AiProviderId[];

export function isAiProviderId(value: unknown): value is AiProviderId {
  return typeof value === "string" && value in AI_PROVIDERS;
}

/** Resolve a provider id, falling back to the default for unknown values. */
export function getAiProvider(id?: unknown): AiProvider {
  return isAiProviderId(id) ? AI_PROVIDERS[id] : AI_PROVIDERS.deepseek;
}

/** The provider a tab URL belongs to, if any. */
export function providerForUrl(url: string | undefined): AiProvider | null {
  if (!url) return null;
  return (
    AI_PROVIDER_IDS.map((id) => AI_PROVIDERS[id]).find((provider) =>
      provider.hostPattern.test(url),
    ) ?? null
  );
}

function pathOf(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

/** True for the provider's sign-in screen, where composing cannot work. */
export function isProviderLoginUrl(
  provider: AiProvider,
  url: string | undefined,
): boolean {
  if (!url) return false;
  const path = pathOf(url);
  return path !== null && provider.loginPath.test(path);
}

/** A conversation URL is not a new chat; root (and draft routes) are. */
export function isProviderNewChatUrl(
  provider: AiProvider,
  url: string | undefined,
): boolean {
  if (!url) return false;
  const path = pathOf(url);
  if (path === null) return false;
  const trimmed = path.replace(/\/+$/, "");
  return provider.newChatPaths.some((pattern) =>
    pattern.test(trimmed === "" ? "/" : trimmed),
  );
}

/**
 * Canonical location key for "is this still the same chat?" comparisons: every
 * new-chat route collapses to one key so `/` and `/c/new-chat` are not treated
 * as different places.
 */
export function chatLocationKey(
  provider: AiProvider,
  url: string | undefined,
): string {
  if (isProviderNewChatUrl(provider, url)) return "new-chat";
  return pathOf(url ?? "") ?? "";
}
