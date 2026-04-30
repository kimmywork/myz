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

  const hostname = url.hostname.toLowerCase();
  if (!["x.com", "twitter.com"].includes(hostname)) {
    return url.toString();
  }

  const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
  if (!match) {
    return `https://x.com${url.pathname}`;
  }

  return `https://x.com/${match[1]}/status/${match[2]}`;
}

export function normalizeMastodonStatusUrl(
  input: string,
  base?: string,
): string {
  const trimmed = (input || "").trim();
  if (!trimmed) {
    return "";
  }

  let url: URL;
  try {
    url = new URL(trimmed, base || undefined);
  } catch {
    return "";
  }

  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}
