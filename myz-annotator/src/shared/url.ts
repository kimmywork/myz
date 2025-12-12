const WAYBACK_HOSTNAME = "web.archive.org";

export function canonicalUrl(url?: string): string {
  const archive = extractArchiveInfo(url);
  if (archive?.originalUrl) {
    return normalizeUrlValue(archive.originalUrl);
  }
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

  const archiveFromRaw = extractArchiveInfo(rawUrl);
  if (archiveFromRaw?.originalUrl) {
    aliases.add(normalizeUrlValue(archiveFromRaw.originalUrl));
    if (archiveFromRaw.timestamp) {
      aliases.add(
        buildArchiveSnapshotUrl(
          archiveFromRaw.timestamp,
          archiveFromRaw.originalUrl,
        ),
      );
    }
  }

  return Array.from(aliases).filter(Boolean);
}

export function normalizeUrlValue(rawUrl: any) {
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

export function isArchiveUrl(url: string) {
  const info = extractArchiveInfo(url);
  return Boolean(info?.originalUrl);
}

export function buildArchiveSnapshotUrl(
  timestamp: string | number,
  originalUrl: string,
) {
  if (!timestamp || !originalUrl) {
    return "";
  }
  const safeTimestamp = String(timestamp)
    .replace(/[^0-9]/g, "")
    .slice(0, 14);
  if (!safeTimestamp) {
    return "";
  }
  return `https://${WAYBACK_HOSTNAME}/web/${safeTimestamp}/${originalUrl}`;
}

type ArchiveInfo = {
  timestamp: string | null;
  originalUrl: string;
  rawTimestamp: string;
};

export function extractArchiveInfo(url?: any): ArchiveInfo | null {
  if (typeof url !== "string" || !url) {
    return null;
  }
  try {
    const instance = new URL(url);
    if (instance.hostname !== WAYBACK_HOSTNAME) {
      return null;
    }
    const path = instance.pathname;
    if (!path.startsWith("/web/")) {
      return null;
    }
    const remainder = path.slice(5);
    const slashIndex = remainder.indexOf("/");
    if (slashIndex === -1) {
      return null;
    }
    const rawStamp = remainder.slice(0, slashIndex);
    const resourcePart = remainder.slice(slashIndex + 1);
    if (!resourcePart) {
      return null;
    }
    const decodedResource = decodeURIComponent(resourcePart);
    let cleanedResource = decodedResource;
    const prefixMatch = cleanedResource.match(
      /^(?:id_|if_|im_|mp_|js_|cs_|fw_|kb_|mu_|oe_|pn_|sp_|tp_|ws_)/,
    );
    if (prefixMatch) {
      cleanedResource = cleanedResource.slice(prefixMatch[0].length);
      if (cleanedResource.startsWith("/")) {
        cleanedResource = cleanedResource.slice(1);
      }
    }
    const hasProtocol = /^https?:\/\//i.test(cleanedResource);
    const originalUrl = hasProtocol
      ? cleanedResource
      : `https://${cleanedResource.replace(/^\/+/, "")}`;
    const timestamp = rawStamp.replace(/[^0-9]/g, "").slice(0, 14) || null;
    return {
      timestamp,
      originalUrl,
      rawTimestamp: rawStamp,
    };
  } catch (error) {
    return null;
  }
}
