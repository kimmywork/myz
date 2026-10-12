import { unzipSync, type Unzipped } from "fflate";
import {
  findCover,
  opfPathFromContainer,
  readManifest,
  readSpine,
} from "./parse/container.js";
import { dirOf, normalizeZipPath } from "./parse/paths.js";
import { parseNavToc, parseNcxToc, resolveTocHrefs } from "./parse/toc.js";
import {
  NCX_MEDIA_TYPE,
  type EpubBook,
  type EpubMetadata,
  type EpubTocEntry,
} from "./parse/types.js";
import { decodeXml, textOf } from "./parse/xml.js";
import UnzipWorker from "./unzip.worker?worker";

/**
 * EPUB parsing (EPUB plan E2). Turns the archive into a stable model the
 * reader can render without touching the zip again. Container/OPF/spine, TOC
 * (nav + NCX) and XML helpers live under `epub/parse/`.
 */
export {
  XHTML_MEDIA_TYPE,
  NCX_MEDIA_TYPE,
  type EpubMetadata,
  type EpubManifestItem,
  type EpubSpineItem,
  type EpubTocEntry,
  type EpubBook,
} from "./parse/types.js";
export { normalizeZipPath, resolveHref, dirOf } from "./parse/paths.js";
export { sanitizeEpubXhtml } from "./parse/xml.js";

function toFileMap(raw: Unzipped): Map<string, Uint8Array<ArrayBuffer>> {
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  for (const [name, data] of Object.entries(raw)) {
    files.set(normalizeZipPath(name), data);
  }
  return files;
}

/** Parses an already-unzipped EPUB archive into the reader model. */
export function parseEpubFromFiles(raw: Unzipped): EpubBook {
  const files = toFileMap(raw);
  const opfPath = opfPathFromContainer(files);
  const opf = files.get(opfPath);
  if (!opf) {
    throw new Error(`不是有效的 EPUB：找不到 ${opfPath}`);
  }
  const opfDir = dirOf(opfPath);
  const doc = decodeXml(opf);
  if (doc.querySelector("parsererror")) {
    throw new Error("不是有效的 EPUB：OPF 解析失败");
  }

  const manifest = readManifest(doc, opfDir);
  const spine = readSpine(doc, manifest);

  const navItem = manifest.find((item) => item.properties.includes("nav"));
  let toc: EpubTocEntry[] = [];
  if (navItem) {
    const navBytes = files.get(navItem.href);
    if (navBytes) {
      toc = resolveTocHrefs(
        parseNavToc(decodeXml(navBytes)),
        dirOf(navItem.href),
      );
    }
  }
  if (!toc.length) {
    const ncx = manifest.find((item) => item.mediaType === NCX_MEDIA_TYPE);
    const ncxBytes = ncx ? files.get(ncx.href) : undefined;
    if (ncx && ncxBytes) {
      toc = resolveTocHrefs(parseNcxToc(decodeXml(ncxBytes)), dirOf(ncx.href));
    }
  }

  const metadata: EpubMetadata = {
    title: textOf(doc, "title") || "未命名 EPUB",
    author: textOf(doc, "creator"),
    language: textOf(doc, "language"),
    identifier: textOf(doc, "identifier"),
    publisher: textOf(doc, "publisher"),
    spineCount: spine.length,
  };

  return {
    opfPath,
    opfDir,
    metadata,
    manifest,
    spine,
    toc,
    coverPath: findCover(doc, manifest, opfDir),
    files,
  };
}

/** Parses an EPUB archive into the reader model (synchronous). */
export function parseEpub(bytes: ArrayBuffer): EpubBook {
  return parseEpubFromFiles(unzipSync(new Uint8Array(bytes)));
}

let unzipWorker: Worker | null = null;
let unzipRequestId = 0;

/**
 * Decompresses the archive in a web worker (keeping the UI responsive for large
 * books), then parses the result on the main thread. Prefer this over the
 * synchronous `parseEpub` for user-initiated opens.
 *
 * Contract: `bytes` is transferred (detached) to the worker. Pass a `slice()`
 * copy if the same buffer must be reused afterwards.
 */
export async function parseEpubAsync(bytes: ArrayBuffer): Promise<EpubBook> {
  const raw = await unzipInWorker(bytes);
  return parseEpubFromFiles(raw);
}

function unzipInWorker(bytes: ArrayBuffer): Promise<Unzipped> {
  unzipWorker ??= new UnzipWorker();
  const worker = unzipWorker;
  const id = (unzipRequestId += 1);
  return new Promise((resolve, reject) => {
    const onMessage = (
      event: MessageEvent<
        | {
            id: number;
            ok: true;
            files: Array<[string, Uint8Array<ArrayBuffer>]>;
          }
        | { id: number; ok: false; error: string }
      >,
    ) => {
      if (event.data.id !== id) return;
      worker.removeEventListener("message", onMessage);
      if (event.data.ok) {
        const raw: Unzipped = {};
        for (const [name, data] of event.data.files) raw[name] = data;
        resolve(raw);
      } else {
        reject(new Error(event.data.error || "解压失败"));
      }
    };
    worker.addEventListener("message", onMessage);
    // Transfer the source buffer so it is not copied into the worker. The
    // caller's `bytes` is detached once this runs; callers that need to reuse
    // it must pass a `slice()` copy (see the `parseEpubAsync` contract).
    worker.postMessage({ id, bytes }, [bytes]);
  });
}

/**
 * Minimal metadata read used to open an EPUB. Kept as a thin wrapper so callers
 * that only need the header do not deal with the full model.
 */
export function parseEpubMetadata(bytes: ArrayBuffer): EpubMetadata {
  return parseEpub(bytes).metadata;
}
