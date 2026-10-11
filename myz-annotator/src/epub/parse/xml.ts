import { strFromU8 } from "fflate";

export function decodeXml(source: Uint8Array): Document {
  return new DOMParser().parseFromString(strFromU8(source), "application/xml");
}

export function firstByLocalName(
  doc: Document,
  localName: string,
): Element | null {
  const all = doc.getElementsByTagNameNS("*", localName);
  return all.length ? all[0] : null;
}

export function allByLocalName(doc: Document, localName: string): Element[] {
  return Array.from(doc.getElementsByTagNameNS("*", localName));
}

export function textOf(doc: Document, localName: string): string {
  return firstByLocalName(doc, localName)?.textContent?.trim() || "";
}

export function attrByLocalName(el: Element, localName: string): string {
  for (const attr of Array.from(el.attributes)) {
    if (attr.localName === localName) return attr.value;
  }
  return "";
}

/** Removes scripts and inline handlers from a parsed EPUB XHTML document. */
export function sanitizeEpubXhtml(doc: Document): Document {
  doc.querySelectorAll("script, iframe, object, embed").forEach((el) => {
    el.remove();
  });
  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) el.removeAttribute(attr.name);
      if (
        (name === "href" || name === "src") &&
        attr.value.trim().toLowerCase().startsWith("javascript:")
      ) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return doc;
}
