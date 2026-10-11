export function dirOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

/** Collapses `.`/`..` and duplicate slashes so lookups are stable. */
export function normalizeZipPath(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join("/");
}

/** Resolves a manifest/`src` href against the directory that holds it. */
export function resolveHref(baseDir: string, href: string): string {
  const clean = href.split("#")[0].split("?")[0];
  const decoded = (() => {
    try {
      return decodeURIComponent(clean);
    } catch {
      return clean;
    }
  })();
  if (!decoded) return normalizeZipPath(baseDir);
  if (decoded.startsWith("/")) return normalizeZipPath(decoded);
  return normalizeZipPath(baseDir ? `${baseDir}/${decoded}` : decoded);
}
