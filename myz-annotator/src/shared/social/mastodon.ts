import { RECORD_KINDS } from "@/shared/types";

/**
 * Helpers for importing Mastodon content.
 *
 * Environment-agnostic (no DOM / Chrome APIs) so it can be reused across worker/UI.
 */

export interface ParsedMastodonProfile {
  username: string;
  instanceHost: string;
  profileUrl: string;
}

export function parseMastodonProfileUrl(input: string): ParsedMastodonProfile {
  const trimmed = (input || "").trim();
  if (!trimmed) {
    throw new Error("请填写 Mastodon 个人主页地址");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Mastodon 个人主页地址格式无效");
  }

  if (!/^https?:$/i.test(url.protocol)) {
    throw new Error("Mastodon 个人主页地址必须以 http(s) 开头");
  }
  if (!url.hostname) {
    throw new Error("Mastodon 个人主页地址缺少域名");
  }

  const first = url.pathname
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean)[0];
  if (!first || !first.startsWith("@")) {
    throw new Error(
      "Mastodon 个人主页地址应类似 https://mastodon.social/@username",
    );
  }
  const username = first.slice(1);
  if (!username) {
    throw new Error("无法从主页地址解析用户名");
  }

  const normalizedProfileUrl = `https://${url.hostname}/@${username}`;
  return {
    username,
    instanceHost: url.hostname,
    profileUrl: normalizedProfileUrl,
  };
}

export function normalizeMastodonStatusUrl(
  input: string,
  base?: string,
): string {
  const trimmed = (input || "").trim();
  if (!trimmed) return "";

  let url: URL;
  try {
    url = new URL(trimmed, base || undefined);
  } catch {
    return "";
  }

  url.hash = "";
  url.search = "";

  // Common Mastodon status URL forms:
  // - https://mastodon.social/@user/1234567890
  // - https://mastodon.social/@user/1234567890/ (normalize trailing slash)
  // - /@user/1234567890
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

export function getMastodonAuthorFromStatusUrl(
  input: string,
  base?: string,
): string {
  const normalized = normalizeMastodonStatusUrl(input, base);
  if (!normalized) return "";
  try {
    const url = new URL(normalized);
    const match = url.pathname.match(/^\/@([^/]+)\/\d+$/);
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

export function buildTootRecordTitle({
  kind,
  actorUsername,
  statusAuthorUsername,
  replyToUsername,
  createdAt,
}: {
  kind: RECORD_KINDS;
  actorUsername: string;
  statusAuthorUsername: string;
  replyToUsername?: string;
  createdAt: string;
}) {
  const time = formatLocalDateTimeForTitle(createdAt);
  const actor = actorUsername.startsWith("@")
    ? actorUsername
    : `@${actorUsername}`;
  const author = statusAuthorUsername.startsWith("@")
    ? statusAuthorUsername
    : `@${statusAuthorUsername}`;
  const replyTo = replyToUsername
    ? replyToUsername.startsWith("@")
      ? replyToUsername
      : `@${replyToUsername}`
    : "";

  if (kind === RECORD_KINDS.TOOT_REPLY) {
    if (replyTo) {
      return `${actor} 回复 ${replyTo} 的嘟文（时间 ${time}）`;
    }
    return `${actor} 的回复（时间 ${time}）`;
  }
  if (kind === RECORD_KINDS.TOOT_BOOST) {
    return `转嘟 ${author} 的嘟文（时间 ${time}）`;
  }
  if (kind === RECORD_KINDS.TOOT_FAVORITE) {
    return `点赞 ${author} 的嘟文（时间 ${time}）`;
  }
  if (kind === RECORD_KINDS.TOOT_BOOKMARK) {
    return `收藏 ${author} 的嘟文（时间 ${time}）`;
  }
  return `${author} 的嘟文（时间 ${time}）`;
}

export function extractHashtagsFromText(text: string): string[] {
  const value = (text || "").trim();
  if (!value) {
    return [];
  }
  const tags = new Set<string>();

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
