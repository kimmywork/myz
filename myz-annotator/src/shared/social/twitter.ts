import { RECORD_KINDS } from "@/shared/types";

/**
 * Helpers for importing Twitter/X content.
 *
 * This module is intentionally environment-agnostic (no DOM / Chrome APIs),
 * so it can be reused by background importers and UI validation.
 */

export const TWITTER_HOSTS = new Set(["x.com", "twitter.com"]);

export interface ParsedTwitterProfile {
  username: string;
  profileUrl: string;
}

export function isTwitterHost(hostname: string): boolean {
  const normalized = (hostname || "").toLowerCase();
  return TWITTER_HOSTS.has(normalized);
}

/**
 * Accepts a profile URL like `https://x.com/kenpusney` and extracts the username.
 */
export function parseTwitterProfileUrl(input: string): ParsedTwitterProfile {
  const trimmed = (input || "").trim();
  if (!trimmed) {
    throw new Error("请填写 Twitter/X 个人主页地址");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Twitter/X 个人主页地址格式无效");
  }

  if (!/^https?:$/i.test(url.protocol)) {
    throw new Error("Twitter/X 个人主页地址必须以 http(s) 开头");
  }
  if (!isTwitterHost(url.hostname)) {
    throw new Error("仅支持 x.com 或 twitter.com 的个人主页地址");
  }

  const username = url.pathname
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)[0];
  if (!username) {
    throw new Error("无法从主页地址解析用户名");
  }
  if (!/^[A-Za-z0-9_]{1,30}$/.test(username)) {
    throw new Error("主页地址中的用户名不合法");
  }

  const normalizedProfileUrl = `https://x.com/${username}`;
  return { username, profileUrl: normalizedProfileUrl };
}

/**
 * Normalizes a tweet URL to `https://x.com/<user>/status/<id>` (no query/hash, no extra segments).
 */
export function normalizeTweetUrl(input: string): string {
  const trimmed = (input || "").trim();
  if (!trimmed) {
    return "";
  }
  let url: URL;
  try {
    url = new URL(trimmed, "https://x.com");
  } catch {
    return "";
  }
  if (!isTwitterHost(url.hostname)) {
    return url.toString();
  }
  const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
  if (!match) {
    return `https://x.com${url.pathname}`;
  }
  const user = match[1];
  const id = match[2];
  return `https://x.com/${user}/status/${id}`;
}

export function getTweetAuthorFromUrl(input: string): string {
  const normalized = normalizeTweetUrl(input);
  if (!normalized) return "";
  try {
    const url = new URL(normalized);
    const match = url.pathname.match(/^\/([^/]+)\/status\/\d+/);
    return match?.[1] || "";
  } catch {
    return "";
  }
}

export function formatLocalDateTimeForTitle(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return "";
  }
  const date = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function buildTweetRecordTitle({
  kind,
  actorUsername,
  tweetAuthorUsername,
  replyToUsername,
  createdAt,
}: {
  kind: RECORD_KINDS;
  actorUsername: string;
  tweetAuthorUsername: string;
  replyToUsername?: string;
  createdAt: string;
}) {
  const time = formatLocalDateTimeForTitle(createdAt);
  const actor = actorUsername.startsWith("@") ? actorUsername : `@${actorUsername}`;
  const author = tweetAuthorUsername.startsWith("@")
    ? tweetAuthorUsername
    : `@${tweetAuthorUsername}`;
  const replyTo = replyToUsername
    ? replyToUsername.startsWith("@")
      ? replyToUsername
      : `@${replyToUsername}`
    : "";

  if (kind === RECORD_KINDS.TWEET_REPLY) {
    if (replyTo) {
      return `${actor} 回复 ${replyTo} 的推文（时间 ${time}）`;
    }
    return `${actor} 的回复（时间 ${time}）`;
  }
  if (kind === RECORD_KINDS.TWEET_RETWEET) {
    return `转推 ${author} 的推文（时间 ${time}）`;
  }
  if (kind === RECORD_KINDS.TWEET_FAVORITE) {
    return `点赞 ${author} 的推文（时间 ${time}）`;
  }
  if (kind === RECORD_KINDS.TWEET_BOOKMARK) {
    return `收藏 ${author} 的推文（时间 ${time}）`;
  }
  return `${author} 的推文（时间 ${time}）`;
}

/**
 * Extracts hashtag tokens (without leading `#`) from plain text.
 */
export function extractHashtagsFromText(text: string): string[] {
  const value = (text || "").trim();
  if (!value) {
    return [];
  }
  const tags = new Set<string>();
  // eslint-disable-next-line unicorn/better-regex
  const regex = /(^|[\s\p{P}])#([\p{L}\p{N}_]{1,100})/gu;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(value))) {
    const tag = (match[2] || "").trim();
    if (tag) {
      tags.add(tag);
    }
  }
  return Array.from(tags);
}
