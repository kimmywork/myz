/**
 * "Should this page be snapshotted?" (§I8)
 *
 * Endless-scroll pages cannot be captured as "the whole page": extending from a
 * record to both sides never reaches an edge, and the result would be a
 * headless fragment the user believes is complete.
 *
 * The rule is deliberately conservative. The two mistakes are not equal:
 *
 * - a normal article judged endless → the user cannot save it, but is told so
 *   and can try again (visible, recoverable);
 * - an endless page judged normal → the user gets a fragment, believes it is
 *   saved, and finds out later (invisible, unrecoverable).
 *
 * So the site table only blocks the list surfaces it names, and anything it does
 * not name is allowed. I9's truncation is the backstop for the pages this
 * misses on purpose.
 */

export interface PageEligibility {
  /** Whether a snapshot may be taken. */
  capture: boolean;
  /** Why not, for the user-facing message. */
  reason?: string;
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

  // Short-video and social feeds with no bottom edge.
  {
    pattern:
      /^https?:\/\/(?:www\.)?(?:douyin|tiktok)\.com\/(?:@[^/?#]+\/?|[?#]|$)/i,
    mode: "block",
    label: "short-video-feed",
  },
  {
    pattern: /^https?:\/\/(?:www\.)?instagram\.com\/(?:[?#]|explore|reels)/i,
    mode: "block",
    label: "instagram-feed",
  },
  {
    pattern:
      /^https?:\/\/(?:www\.)?facebook\.com\/(?:[?#]|home|watch|reels|marketplace)/i,
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
 * Decides whether `url` is a capturable page.
 *
 * Unknown pages are capturable: the site table is an allow-list of known
 * endless surfaces, not a gate.
 */
export function classifyPage(url: string): PageEligibility {
  for (const rule of ENDLESS_SCROLL_RULES) {
    if (!rule.pattern.test(url)) continue;
    return rule.mode === "allow"
      ? { capture: true, rule: rule.label }
      : {
          capture: false,
          rule: rule.label,
          reason: "这是无限滚动页面，快照会截出没有头尾的内容，因此不采集",
        };
  }
  return { capture: true, rule: "default" };
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
  if (!byUrl.capture) return byUrl;
  if (metrics && looksEndlessByLayout(metrics)) {
    return {
      capture: false,
      rule: "layout",
      reason:
        "这个页面看起来是无限滚动（内容高度远超视口且首屏几乎没有正文），因此不采集",
    };
  }
  return byUrl;
}
