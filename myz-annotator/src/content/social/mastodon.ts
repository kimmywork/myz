import { normalizeMastodonStatusUrl } from "@/shared/social/mastodon";

/**
 * DOM scraper for Mastodon timelines.
 *
 * Runs inside the content-script environment (has DOM access).
 * Returned data is serializable for background importer consumption.
 */

export interface ScrapedToot {
  url: string;
  text: string;
  createdAt: string;
  hashtags: string[];
  isReply?: boolean;
  isBoost?: boolean;
  replyToUsernames?: string[];
}

export interface ScrapeMastodonTimelineOptions {
  limit?: number;
  scrollRounds?: number;
  scrollDelayMs?: number;
  requireReplyContext?: boolean;
  requireBoostContext?: boolean;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, Math.max(0, ms || 0));
  });
}

function parseReplyAndBoostContext(container: HTMLElement) {
  const prepend =
    container.querySelector<HTMLElement>(
      ".status__prepend, .status__prepend > span, .status__prepend > a",
    ) || null;
  const raw = (prepend?.innerText || "").trim();
  const text = raw.toLowerCase();
  const isReply =
    text.includes("reply") ||
    text.includes("in reply to") ||
    text.includes("回复") ||
    text.includes("正在回复");
  const isBoost =
    text.includes("boost") ||
    text.includes("boosted") ||
    text.includes("reblog") ||
    text.includes("转嘟") ||
    text.includes("已转嘟");

  const replyToUsernames = (() => {
    const handles: string[] = [];
    const regex = /@([A-Za-z0-9_\.:-]{1,80})/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(raw))) {
      if (match[1]) {
        handles.push(match[1]);
      }
    }
    return Array.from(new Set(handles));
  })();

  return { isReply, isBoost, replyToUsernames };
}

function collectTootsFromDom({
  requireReplyContext = false,
  requireBoostContext = false,
}: {
  requireReplyContext?: boolean;
  requireBoostContext?: boolean;
}): ScrapedToot[] {
  const results: ScrapedToot[] = [];
  const seen = new Set<string>();

  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      "article.status, article[data-id].status, div.status, article[data-id]",
    ),
  );

  for (const container of candidates) {
    const context = parseReplyAndBoostContext(container);
    if (requireReplyContext && !context.isReply) {
      continue;
    }
    if (requireBoostContext && !context.isBoost) {
      continue;
    }

    const time = container.querySelector<HTMLTimeElement>("time");
    const createdAt = time?.getAttribute("datetime") || "";

    // Prefer link that contains '/@user/<id>' in href.
    const link =
      container.querySelector<HTMLAnchorElement>('a[href*="/@"][href*="/"]') ||
      (time?.closest("a") as HTMLAnchorElement | null);
    const href = link?.href || link?.getAttribute("href") || "";
    const url = normalizeMastodonStatusUrl(href, window.location.href);
    if (!url || seen.has(url)) {
      continue;
    }

    const content =
      container.querySelector<HTMLElement>(".status__content") ||
      container.querySelector<HTMLElement>(".status__content__text") ||
      container.querySelector<HTMLElement>(".status__content__text p") ||
      null;
    const text = (content?.innerText || "").trim();
    if (!text) {
      continue;
    }

    const hashtags = Array.from(
      container.querySelectorAll<HTMLAnchorElement>(
        'a.hashtag, a[href*="/tags/"], a[href*="/tag/"]',
      ),
    )
      .map((a) => (a.textContent || "").trim())
      .map((t) => (t.startsWith("#") ? t.slice(1) : t))
      .filter(Boolean);

    results.push({
      url,
      text,
      createdAt,
      hashtags: Array.from(new Set(hashtags)),
      isReply: context.isReply,
      isBoost: context.isBoost,
      replyToUsernames: context.replyToUsernames,
    });
    seen.add(url);
  }

  return results;
}

export async function scrapeMastodonTimeline(
  options: ScrapeMastodonTimelineOptions = {},
): Promise<ScrapedToot[]> {
  const limit =
    typeof options.limit === "number" && options.limit > 0
      ? Math.floor(options.limit)
      : 50;
  const scrollRounds = (() => {
    if (typeof options.scrollRounds === "number" && options.scrollRounds > 0) {
      return Math.floor(options.scrollRounds);
    }
    const estimatedPerRound = 10;
    return Math.max(8, Math.ceil(limit / estimatedPerRound) + 4);
  })();
  const scrollDelayMs =
    typeof options.scrollDelayMs === "number" && options.scrollDelayMs > 0
      ? Math.floor(options.scrollDelayMs)
      : 1200;
  const requireReplyContext = Boolean(options.requireReplyContext);
  const requireBoostContext = Boolean(options.requireBoostContext);

  const combined: ScrapedToot[] = [];
  const seen = new Set<string>();

  const add = (batch: ScrapedToot[]) => {
    let added = 0;
    for (const item of batch) {
      if (!item?.url || seen.has(item.url)) {
        continue;
      }
      seen.add(item.url);
      combined.push(item);
      added += 1;
      if (combined.length >= limit) {
        return { reachedLimit: true, added };
      }
    }
    return { reachedLimit: false, added };
  };

  const first = add(
    collectTootsFromDom({ requireReplyContext, requireBoostContext }),
  );
  if (first.reachedLimit) {
    return combined.slice(0, limit);
  }

  let consecutiveNoNew = first.added === 0 ? 1 : 0;
  const MAX_NO_NEW_ROUNDS = 3;

  for (let round = 0; round < scrollRounds; round += 1) {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    await sleep(scrollDelayMs);
    const result = add(
      collectTootsFromDom({ requireReplyContext, requireBoostContext }),
    );
    if (result.added === 0) {
      consecutiveNoNew += 1;
    } else {
      consecutiveNoNew = 0;
    }
    if (consecutiveNoNew >= MAX_NO_NEW_ROUNDS) {
      break;
    }
    if (result.reachedLimit) {
      break;
    }
  }

  return combined.slice(0, limit);
}

