import {
  deleteHighlight,
  generateId,
  getAllHighlights,
  getHighlightsForUrl,
  saveHighlight,
} from "./storage.js";
import { indexRecord, removeRecordFromIndex } from "./vectoria-index.js";
import { MyZRecord, RECORD_KINDS } from "@/shared/types";
import {
  buildTweetRecordTitle,
  extractHashtagsFromText,
  getTweetAuthorFromUrl,
  normalizeTweetUrl,
  parseTwitterProfileUrl,
} from "@/shared/social/twitter";

/**
 * Social import orchestrator.
 *
 * Background opens provider pages in inactive tabs, then asks the content script
 * to scrape DOM data via the message bus. Scraped items are persisted as `MyZRecord`s.
 *
 * The provider abstraction is intentionally lightweight so we can extend to other
 * communities (Mastodon, Misskey, Bluesky, Threads...) later.
 */

export type SocialProviderId = "twitter";

export interface SocialImportRequest {
  provider: SocialProviderId;
  profileUrl: string;
  kinds?: RECORD_KINDS[];
  limitPerKind?: number;
  scrollRounds?: number;
}

export interface SocialImportKindResult {
  fetched: number;
  inserted: number;
  skipped: number;
}

export interface SocialImportResult {
  provider: SocialProviderId;
  username: string;
  inserted: number;
  skipped: number;
  byKind: Partial<Record<RECORD_KINDS, SocialImportKindResult>>;
}

type TwitterScrapePayload = {
  limit?: number;
  scrollRounds?: number;
  scrollDelayMs?: number;
  requireReplyContext?: boolean;
};

async function sendTabMessage<T = any, R = any>(
  tabId: number,
  type: string,
  payload?: T,
): Promise<R> {
  const deadline = Date.now() + 12_000;
  let lastError: Error | null = null;

  while (Date.now() < deadline) {
    try {
      const result = await new Promise<R>((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { type, payload }, (response) => {
          const err = chrome.runtime.lastError;
          if (err) {
            reject(new Error(err.message || String(err)));
            return;
          }
          if (!response?.ok) {
            reject(new Error(response?.error || "未知错误"));
            return;
          }
          resolve(response.data as R);
        });
      });
      return result;
    } catch (error) {
      lastError = error as Error;
      // Content script may not be ready yet right after navigation.
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  throw lastError || new Error("无法与页面脚本通信");
}

async function waitForTabComplete(tabId: number, timeoutMs = 45_000) {
  const started = Date.now();
  return await new Promise<void>((resolve, reject) => {
    const timer = setInterval(async () => {
      if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error("页面加载超时"));
        return;
      }
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab?.status === "complete") {
          clearInterval(timer);
          resolve();
        }
      } catch (error) {
        // keep polling until timeout
      }
    }, 300);
  });
}

async function createImportWindow(initialUrl: string) {
  const win = await chrome.windows.create({
    url: initialUrl,
    focused: true,
    type: "normal",
  });
  const tabId = win?.tabs?.[0]?.id;
  if (!win?.id || typeof tabId !== "number") {
    throw new Error("无法创建导入窗口");
  }
  return { windowId: win.id, tabId };
}

async function ensureImportTabUrl(tabId: number, windowId: number, url: string) {
  try {
    await chrome.windows.update(windowId, { focused: true });
  } catch {}
  await chrome.tabs.update(tabId, { url, active: true });
  await waitForTabComplete(tabId);
  // Give SPA content some time to render the timeline.
  await new Promise((r) => setTimeout(r, 1600));
}

function getTwitterTargetUrl(username: string, kind: RECORD_KINDS): string {
  if (kind === RECORD_KINDS.TWEET_REPLY) {
    return `https://x.com/${username}/with_replies`;
  }
  if (kind === RECORD_KINDS.TWEET_FAVORITE) {
    return `https://x.com/${username}/likes`;
  }
  if (kind === RECORD_KINDS.TWEET_BOOKMARK) {
    return `https://x.com/i/bookmarks`;
  }
  return `https://x.com/${username}`;
}

function calculateScrollRounds(limitPerKind: number, minRounds: number) {
  const limit = Math.max(1, limitPerKind || 1);
  const estimatedPerRound = 8;
  const computed = Math.ceil(limit / estimatedPerRound) + 4;
  return Math.min(80, Math.max(minRounds, computed));
}

function coerceKinds(kinds?: RECORD_KINDS[]): RECORD_KINDS[] {
  const valid = new Set(Object.values(RECORD_KINDS));
  const selected = (Array.isArray(kinds) ? kinds : [])
    .filter((k) => valid.has(k))
    .filter((k) => String(k).startsWith("tweet:"));
  if (selected.length) {
    const unique = Array.from(new Set(selected));
    // Ensure stable priority: post -> reply -> favorite -> bookmark.
    const priority: RECORD_KINDS[] = [
      RECORD_KINDS.TWEET_POST,
      RECORD_KINDS.TWEET_REPLY,
      RECORD_KINDS.TWEET_FAVORITE,
      RECORD_KINDS.TWEET_BOOKMARK,
    ];
    return unique.sort((a, b) => priority.indexOf(a) - priority.indexOf(b));
  }
  return [
    RECORD_KINDS.TWEET_POST,
    RECORD_KINDS.TWEET_REPLY,
    RECORD_KINDS.TWEET_FAVORITE,
    RECORD_KINDS.TWEET_BOOKMARK,
  ];
}

function coercePositiveInt(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return fallback;
}

function buildTweetRecord({
  actorUsername,
  kind,
  url,
  text,
  createdAt,
  tags,
  title,
}: {
  actorUsername: string;
  kind: RECORD_KINDS;
  url: string;
  text: string;
  createdAt: string;
  tags: string[];
  title: string;
}): MyZRecord {
  const tweetTime = (() => {
    const parsed = Date.parse(createdAt);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
    return new Date().toISOString();
  })();

  const normalizedUrl = normalizeTweetUrl(url) || url;

  return {
    id: generateId(),
    kind,
    text: text.trim(),
    tags,
    createdAt: tweetTime,
    updatedAt: tweetTime,
    url: normalizedUrl,
    sourceUrl: normalizedUrl,
    hostname: "x.com",
    title,
  };
}

async function isDuplicateTweetRecord({
  url,
  kind,
}: {
  url: string;
  kind: RECORD_KINDS;
}): Promise<boolean> {
  if (!url) return false;
  const candidates = new Set([url]);
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "x.com") {
      parsed.hostname = "twitter.com";
      candidates.add(parsed.toString());
    } else if (parsed.hostname === "twitter.com") {
      parsed.hostname = "x.com";
      candidates.add(parsed.toString());
    }
  } catch {
    // ignore
  }
  for (const candidate of candidates) {
    const matches = await getHighlightsForUrl(candidate);
    if (matches.some((record) => record?.kind === kind)) {
      return true;
    }
  }
  return false;
}

async function getExistingTweetKindsForUrl(url: string): Promise<Set<string>> {
  const kinds = new Set<string>();
  if (!url) return kinds;
  const candidates = new Set([url]);
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "x.com") {
      parsed.hostname = "twitter.com";
      candidates.add(parsed.toString());
    } else if (parsed.hostname === "twitter.com") {
      parsed.hostname = "x.com";
      candidates.add(parsed.toString());
    }
  } catch {
    // ignore
  }
  for (const candidate of candidates) {
    const matches = await getHighlightsForUrl(candidate);
    matches.forEach((record) => {
      const kind = typeof record?.kind === "string" ? record.kind : "";
      if (kind.startsWith("tweet:")) {
        kinds.add(kind);
      }
    });
  }
  return kinds;
}

export async function importSocialRecords(
  request: SocialImportRequest,
): Promise<SocialImportResult> {
  if (!request || request.provider !== "twitter") {
    throw new Error("暂不支持该平台");
  }

  const { username } = parseTwitterProfileUrl(request.profileUrl);
  const kinds = coerceKinds(request.kinds);
  const limitPerKind = coercePositiveInt(request.limitPerKind, 60);
  const requestedScrollRounds = coercePositiveInt(request.scrollRounds, 10);
  const scrollRounds = calculateScrollRounds(limitPerKind, requestedScrollRounds);

  const byKind: SocialImportResult["byKind"] = {};
  let inserted = 0;
  let skipped = 0;

  const firstUrl = getTwitterTargetUrl(username, kinds[0] || RECORD_KINDS.TWEET_POST);
  const { windowId, tabId } = await createImportWindow(firstUrl);
  try {
    for (const kind of kinds) {
      const url = getTwitterTargetUrl(username, kind);
      await ensureImportTabUrl(tabId, windowId, url);
      const payload: TwitterScrapePayload = {
        limit: limitPerKind,
        scrollRounds,
        scrollDelayMs: 1600,
        requireReplyContext: kind === RECORD_KINDS.TWEET_REPLY,
      };

      const scraped = await sendTabMessage<TwitterScrapePayload, any[]>(
        tabId,
        "myz:scrapeTwitterTimeline",
        payload,
      );

      const items = Array.isArray(scraped) ? scraped : [];
      const stats: SocialImportKindResult = {
        fetched: items.length,
        inserted: 0,
        skipped: 0,
      };

      for (const item of items) {
        const itemUrl = normalizeTweetUrl(String((item as any)?.url || ""));
        const text = String((item as any)?.text || "").trim();
        if (!itemUrl || !text) {
          continue;
        }

        const tweetAuthor = getTweetAuthorFromUrl(itemUrl);

        // Fix: reply timelines may contain quoted/original tweets from others.
        if (kind === RECORD_KINDS.TWEET_REPLY) {
          if (
            !tweetAuthor ||
            tweetAuthor.toLowerCase() !== username.toLowerCase()
          ) {
            continue;
          }
        }

        // Retweet is a special case on the profile timeline.
        const effectiveKind =
          kind === RECORD_KINDS.TWEET_POST &&
          (Boolean((item as any)?.isRetweet) ||
            (tweetAuthor && tweetAuthor.toLowerCase() !== username.toLowerCase()))
            ? RECORD_KINDS.TWEET_RETWEET
            : kind;

        // If a tweet is already imported as a post (or retweet), do not re-import it as a reply.
        if (effectiveKind === RECORD_KINDS.TWEET_REPLY) {
          const existing = await getExistingTweetKindsForUrl(itemUrl);
          if (
            existing.has(RECORD_KINDS.TWEET_POST) ||
            existing.has(RECORD_KINDS.TWEET_RETWEET)
          ) {
            stats.skipped += 1;
            skipped += 1;
            continue;
          }
        }

        const tags = Array.from(
          new Set([
            ...(((item as any)?.hashtags as string[]) || []),
            ...extractHashtagsFromText(text),
          ]),
        ).filter(Boolean);

        const title = (() => {
          const createdAt = String((item as any)?.createdAt || "");
          const replyToUsernames = Array.isArray((item as any)?.replyToUsernames)
            ? ((item as any).replyToUsernames as any[])
                .map((u) => (typeof u === "string" ? u.trim() : ""))
                .filter(Boolean)
            : [];
          const replyTo = replyToUsernames.find(
            (u) => u.toLowerCase() !== username.toLowerCase(),
          );
          return buildTweetRecordTitle({
            kind: effectiveKind,
            actorUsername: username,
            tweetAuthorUsername: tweetAuthor || username,
            replyToUsername: replyTo,
            createdAt,
          });
        })();

        const record = buildTweetRecord({
          actorUsername: username,
          kind: effectiveKind,
          url: itemUrl,
          text,
          createdAt: String((item as any)?.createdAt || ""),
          tags,
          title,
        });

        if (
          await isDuplicateTweetRecord({ url: record.url, kind: record.kind })
        ) {
          stats.skipped += 1;
          skipped += 1;
          continue;
        }

        await saveHighlight(record);
        await indexRecord(record);
        stats.inserted += 1;
        inserted += 1;
      }

      byKind[kind] = stats;
    }
  } finally {
    try {
      await chrome.windows.remove(windowId);
    } catch {}
  }

  return {
    provider: request.provider,
    username,
    inserted,
    skipped,
    byKind,
  };
}

export async function clearTweetImports() {
  const records = await getAllHighlights();
  const tweetRecords = records.filter(
    (record) => typeof record?.kind === "string" && record.kind.startsWith("tweet:"),
  );
  for (const record of tweetRecords) {
    try {
      await deleteHighlight(record.id);
    } catch (error) {
      // ignore individual failures
    }
    try {
      await removeRecordFromIndex(record.id);
    } catch (error) {
      // ignore index failures
    }
  }
  return { removed: tweetRecords.length };
}
