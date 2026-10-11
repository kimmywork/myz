import { normalizeZipPath, resolveHref } from "./paths.js";
import type { EpubManifestItem, EpubSpineItem } from "./types.js";
import { allByLocalName, decodeXml } from "./xml.js";

export function opfPathFromContainer(files: Map<string, Uint8Array>): string {
  const container = files.get("META-INF/container.xml");
  if (!container) {
    throw new Error("不是有效的 EPUB：缺少 META-INF/container.xml");
  }
  const doc = decodeXml(container);
  const rootfile = doc.querySelector("rootfile");
  const fullPath = rootfile?.getAttribute("full-path") || "";
  if (!fullPath) {
    throw new Error("不是有效的 EPUB：container.xml 未指向 OPF");
  }
  return normalizeZipPath(fullPath);
}

export function readManifest(
  doc: Document,
  opfDir: string,
): EpubManifestItem[] {
  return allByLocalName(doc, "item").map((item) => {
    const href = item.getAttribute("href") || "";
    return {
      id: item.getAttribute("id") || "",
      href: resolveHref(opfDir, href),
      mediaType: item.getAttribute("media-type") || "",
      properties: (item.getAttribute("properties") || "")
        .split(/\s+/)
        .filter(Boolean),
    };
  });
}

export function readSpine(
  doc: Document,
  manifest: EpubManifestItem[],
): EpubSpineItem[] {
  const byId = new Map(manifest.map((item) => [item.id, item]));
  const spine: EpubSpineItem[] = [];
  for (const ref of allByLocalName(doc, "itemref")) {
    const idref = ref.getAttribute("idref") || "";
    const item = byId.get(idref);
    if (!item) continue;
    spine.push({
      idref,
      href: item.href,
      linear: ref.getAttribute("linear") !== "no",
    });
  }
  return spine;
}

export function findCover(
  doc: Document,
  manifest: EpubManifestItem[],
  opfDir: string,
): string | null {
  const byProperties = manifest.find((item) =>
    item.properties.includes("cover-image"),
  );
  if (byProperties) return byProperties.href;
  const metaById = allByLocalName(doc, "meta").find(
    (meta) => (meta.getAttribute("name") || "").toLowerCase() === "cover",
  );
  const coverId = metaById?.getAttribute("content") || "";
  const byId = manifest.find((item) => item.id === coverId);
  if (byId) return byId.href;
  const reference = allByLocalName(doc, "reference").find(
    (ref) => (ref.getAttribute("type") || "").toLowerCase() === "cover",
  );
  const href = reference?.getAttribute("href") || "";
  return href ? resolveHref(opfDir, href) : null;
}
