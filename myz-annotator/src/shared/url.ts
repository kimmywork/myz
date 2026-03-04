export function canonicalUrl(url?: string): string {
  return normalizeUrlValue(url);
}

export function buildUrlAliases(rawUrl: string, canonical: string): string[] {
  const aliases = new Set<string>();
  if (typeof rawUrl === "string" && rawUrl) {
    aliases.add(rawUrl);
    aliases.add(stripHash(rawUrl));
    aliases.add(normalizeUrlValue(rawUrl));
  }
  if (typeof canonical === "string" && canonical) {
    aliases.add(canonical);
  }

  return Array.from(aliases).filter(Boolean);
}

export function normalizeUrlValue(rawUrl: unknown) {
  if (typeof rawUrl !== "string" || !rawUrl) {
    return "";
  }
  try {
    const instance = new URL(rawUrl);
    instance.hash = "";
    stripTrackingSearchParams(instance);
    return instance.toString();
  } catch (error) {
    return stripHash(rawUrl);
  }
}

function stripTrackingSearchParams(urlObject: URL | null) {
  if (!urlObject || !urlObject.searchParams) {
    return;
  }
  const removableKeys = [
    "ref",
    "ref_src",
    "t",
    "fbclid",
    "gclid",
    "mc_cid",
    "mc_eid",
  ];
  removableKeys.forEach((key) => urlObject.searchParams.delete(key));
  Array.from(urlObject.searchParams.keys()).forEach((key) => {
    if (/^utm_/i.test(key)) {
      urlObject.searchParams.delete(key);
    }
  });
}

function stripHash(url: string) {
  if (typeof url !== "string") {
    return "";
  }
  const hashIndex = url.indexOf("#");
  if (hashIndex === -1) {
    return url;
  }
  return url.slice(0, hashIndex);
}

export function extractHostname(url: string) {
  try {
    return new URL(url).hostname;
  } catch (error) {
    return url;
  }
}

export function truncateText(text: string, max = 36) {
  if (!text) {
    return "";
  }
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
