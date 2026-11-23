/**
 * "How should this page be snapshotted?" (§I8 / §3.4, revised 2026-11-23)
 *
 * An article page gets the **whole readable body** — the user's 「整页快照」
 * is the full content, and the viewer folds the display down to the annotated
 * regions (expandable). An endless-scroll page has no whole: extending from a
 * record never reaches an edge, so it gets a **record-anchored window**
 * instead (§3.4 truncation rule: extend from the record to both sides, stop
 * after N elements that hit no neighbouring record).
 *
 * The two mistakes are not equal:
 *
 * - an article judged endless → a window instead of the full body (visible
 *   immediately, and honest about being a fragment);
 * - a feed judged normal → an unbounded capture, rejected by the 10 MB
 *   per-snapshot cap with a visible error.
 *
 * So the site table only blocks the list surfaces it names, and anything it
 * does not name gets the full capture.
 */

/** How much of the page the capture keeps. */
export type SnapshotCaptureMode = "full" | "windowed";

export interface PageEligibility {
  /** `full` = whole readable body; `windowed` = record-anchored fragment. */
  mode: SnapshotCaptureMode;
  /** Which rule decided (useful in tests and logs). */
  rule: string;
}

interface SiteRule {
  /** Matches the page URL. */
  pattern: RegExp;
  /** `block` = endless list surface, `allow` = a single item page inside it. */
  mode: "block" | "allow";
  label: string;
}

/**
 * Endless-scroll surfaces, named per path rather than per domain.
 *
 * A single post/tweet/detail page on the same host IS capturable — it has a
 * real bottom edge — so allow rules must be listed too and are checked first.
 */
export const ENDLESS_SCROLL_RULES: readonly SiteRule[] = [
  // X / Twitter: the timeline surfaces only; a status page is a document.
  {
    pattern: /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[^/]+\/status\/\d+/i,
    mode: "allow",
    label: "x-status",
  },
  {
    pattern:
      /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/(?:home|explore|search|notifications|i\/[^/]+)(?:[/?#]|$)/i,
    mode: "block",
    label: "x-list",
  },
  {
    pattern: /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[^/?#]+\/?(?:[?#]|$)/i,
    mode: "block",
    label: "x-profile",
  },

  // Weibo: home/hot/explore are feeds; a detail page is a post.
  {
    pattern:
      /^https?:\/\/(?:www\.)?weibo\.com\/(?:\d+\/[A-Za-z0-9]+|detail\/\d+)/i,
    mode: "allow",
    label: "weibo-detail",
  },
  {
    pattern:
      /^https?:\/\/(?:www\.)?weibo\.com\/(?:hot|explore|newlogin)?(?:[/?#]|$)/i,
    mode: "block",
    label: "weibo-feed",
  },

  // Reddit: subreddit listings are endless; a comments page is not.
  {
    pattern: /^https?:\/\/(?:www\.)?reddit\.com\/r\/[^/]+\/comments\/[^/?#]+/i,
    mode: "allow",
    label: "reddit-post",
  },
  {
    pattern: /^https?:\/\/(?:www\.)?reddit\.com\/(?:r\/[^/?#]+\/?)?(?:[?#]|$)/i,
    mode: "block",
    label: "reddit-list",
  },
  {
    pattern:
      /^https?:\/\/(?:www\.)?reddit\.com\/(?:best|hot|new|popular|all)(?:[/?#]|$)/i,
    mode: "block",
    label: "reddit-list",
  },

  // Tieba: the thread page is a document, the forum index is a feed.
  {
    pattern: /^https?:\/\/tieba\.baidu\.com\/p\/\d+/i,
    mode: "allow",
    label: "tieba-thread",
  },
  {
    pattern: /^https?:\/\/tieba\.baidu\.com\/f(?:[/?#]|$)/i,
    mode: "block",
    label: "tieba-forum",
  },

  // Short-video and social feeds with no bottom edge. A single video is a
  // document, so its rule comes first: the profile rule must not swallow
  // `/@alice/video/123`.
  {
    pattern:
      /^https?:\/\/(?:www\.)?(?:douyin|tiktok)\.com\/@[^/?#]+\/video\/\d+/i,
    mode: "allow",
    label: "short-video-post",
  },
  {
    pattern:
      /^https?:\/\/(?:www\.)?(?:douyin|tiktok)\.com\/(?:@[^/?#]+\/?|[?#]|$)/i,
    mode: "block",
    label: "short-video-feed",
  },
  // The bare root is a feed too — matching only `[?#]` misses the trailing `/`.
  {
    pattern: /^https?:\/\/(?:www\.)?instagram\.com\/?(?:[?#]|$)/i,
    mode: "block",
    label: "instagram-feed",
  },
  {
    pattern:
      /^https?:\/\/(?:www\.)?instagram\.com\/(?:explore|reels)(?:[/?#]|$)/i,
    mode: "block",
    label: "instagram-feed",
  },
  {
    pattern: /^https?:\/\/(?:www\.)?facebook\.com\/?(?:[?#]|$)/i,
    mode: "block",
    label: "facebook-feed",
  },
  {
    pattern:
      /^https?:\/\/(?:www\.)?facebook\.com\/(?:home|watch|reels|marketplace)(?:[/?#]|$)/i,
    mode: "block",
    label: "facebook-feed",
  },
];

/** Ratio of document height to viewport above which a page looks endless. */
export const ENDLESS_HEIGHT_RATIO = 40;

/** Below this much first-screen text a very tall page is not an article. */
export const ENDLESS_MIN_TEXT = 200;

/**
 * Height-based fallback for endless pages the site table does not name.
 *
 * A page 40 viewports tall with almost no text on screen cannot be a readable
 * article; a long article has text everywhere from the top. Kept high on
 * purpose — a false positive costs the user a page they wanted.
 */
export function looksEndlessByLayout(input: {
  scrollHeight: number;
  viewportHeight: number;
  visibleTextLength: number;
}): boolean {
  if (input.viewportHeight <= 0) return false;
  const ratio = input.scrollHeight / input.viewportHeight;
  return (
    ratio >= ENDLESS_HEIGHT_RATIO && input.visibleTextLength < ENDLESS_MIN_TEXT
  );
}

/**
 * Decides how `url` is captured.
 *
 * Unknown pages get the full capture: the site table is a list of known
 * endless surfaces, not a gate.
 */
export function classifyPage(url: string): PageEligibility {
  for (const rule of ENDLESS_SCROLL_RULES) {
    if (!rule.pattern.test(url)) continue;
    return rule.mode === "allow"
      ? { mode: "full", rule: rule.label }
      : { mode: "windowed", rule: rule.label };
  }
  return { mode: "full", rule: "default" };
}

/**
 * Full decision: URL rules first, then the layout fallback.
 *
 * @param url Page URL.
 * @param metrics Live measurements; omit when the caller has no DOM (tests).
 */
export function evaluatePage(
  url: string,
  metrics?: {
    scrollHeight: number;
    viewportHeight: number;
    visibleTextLength: number;
  },
): PageEligibility {
  const byUrl = classifyPage(url);
  if (byUrl.mode === "windowed") return byUrl;
  if (metrics && looksEndlessByLayout(metrics)) {
    return { mode: "windowed", rule: "layout" };
  }
  return byUrl;
}
