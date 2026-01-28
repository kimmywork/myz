import { normalizeTweetUrl } from "@/shared/social/twitter";

/**
 * DOM scraper for Twitter/X timelines.
 *
 * Runs inside the content-script environment (has DOM access).
 * The returned data is serializable and intended to be consumed by the background importer.
 */

export interface ScrapedTweet {
  url: string;
  text: string;
  createdAt: string;
  hashtags: string[];
  isReply?: boolean;
  isRetweet?: boolean;
  replyToUsernames?: string[];
}

export interface ScrapeTwitterTimelineOptions {
  limit?: number;
  scrollRounds?: number;
  scrollDelayMs?: number;
  requireReplyContext?: boolean;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, Math.max(0, ms || 0));
  });
}

function parseSocialContext(article: HTMLElement) {
  const node = article.querySelector<HTMLElement>('[data-testid="socialContext"]');
  const raw = (node?.innerText || "").trim();
  const text = raw.toLowerCase();
  if (!text) {
    return { isReply: false, isRetweet: false, replyToUsernames: [] as string[] };
  }
  const isReply =
    text.includes("replying to") ||
    text.includes("replied to") ||
    text.includes("正在回复") ||
    text.includes("回复");
  const isRetweet =
    text.includes("reposted") ||
    text.includes("repost") ||
    text.includes("retweeted") ||
    text.includes("转推") ||
    text.includes("转发") ||
    text.includes("转发了") ||
    text.includes("转帖") ||
    text.includes("已转帖");

  const replyToUsernames = (() => {
    const handles: string[] = [];
    const regex = /@([A-Za-z0-9_]{1,30})/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(raw))) {
      if (match[1]) {
        handles.push(match[1]);
      }
    }
    return Array.from(new Set(handles));
  })();

  return { isReply, isRetweet, replyToUsernames };
}

function collectTweetsFromDom({
  requireReplyContext = false,
}: {
  requireReplyContext?: boolean;
}): ScrapedTweet[] {
  const results: ScrapedTweet[] = [];
  const seen = new Set<string>();
  const articles = Array.from(
    document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]'),
  );

  for (const article of articles) {
    const context = parseSocialContext(article);
    if (requireReplyContext && !context.isReply) {
      continue;
    }

    const time = article.querySelector<HTMLTimeElement>("time");
    const link = time?.closest("a") as HTMLAnchorElement | null;
    const href = link?.href || "";
    const url = normalizeTweetUrl(href);
    if (!url || seen.has(url)) {
      continue;
    }

    const textNode = article.querySelector<HTMLElement>(
      '[data-testid="tweetText"]',
    );
    const text = (textNode?.innerText || "").trim();
    if (!text) {
      continue;
    }

    const createdAt = time?.getAttribute("datetime") || "";

    const hashtags = Array.from(
      textNode?.querySelectorAll<HTMLAnchorElement>('a[href*="/hashtag/"]') ||
        [],
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
      isRetweet: context.isRetweet,
      replyToUsernames: context.replyToUsernames,
    });
    seen.add(url);
  }
  return results;
}

export async function scrapeTwitterTimeline(
  options: ScrapeTwitterTimelineOptions = {},
): Promise<ScrapedTweet[]> {
  const limit =
    typeof options.limit === "number" && options.limit > 0
      ? Math.floor(options.limit)
      : 50;
  const scrollRounds = (() => {
    if (typeof options.scrollRounds === "number" && options.scrollRounds > 0) {
      return Math.floor(options.scrollRounds);
    }
    // Dynamic default: larger limits need more scroll rounds.
    // Empirically, each scroll can load only a handful of tweets on slow networks.
    const estimatedPerRound = 8;
    return Math.max(8, Math.ceil(limit / estimatedPerRound) + 4);
  })();
  const scrollDelayMs =
    typeof options.scrollDelayMs === "number" && options.scrollDelayMs > 0
      ? Math.floor(options.scrollDelayMs)
      : 1200;
  const requireReplyContext = Boolean(options.requireReplyContext);

  const combined: ScrapedTweet[] = [];
  const seen = new Set<string>();

  const add = (batch: ScrapedTweet[]) => {
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

  const first = add(collectTweetsFromDom({ requireReplyContext }));
  if (first.reachedLimit) {
    return combined.slice(0, limit);
  }

  let consecutiveNoNew = first.added === 0 ? 1 : 0;
  const MAX_NO_NEW_ROUNDS = 3;

  for (let round = 0; round < scrollRounds; round += 1) {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    await sleep(scrollDelayMs);
    const result = add(collectTweetsFromDom({ requireReplyContext }));
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
