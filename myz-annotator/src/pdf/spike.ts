import * as pdfjsLib from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";
import "pdfjs-dist/web/pdf_viewer.css";

pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();

type PdfDoc = Awaited<ReturnType<typeof pdfjsLib.getDocument>["promise"]>;

interface RectInfo {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SelectionInfo {
  page: number;
  text: string;
  rects: RectInfo[];
}

interface SpikeState {
  doc: PdfDoc | null;
  currentPage: number;
  scale: number;
  fsaSupported: boolean;
  source: string | null;
  lastFingerprint: string | null;
}

const state: SpikeState = {
  doc: null,
  currentPage: 1,
  scale: 1.5,
  fsaSupported:
    typeof (window as unknown as { showOpenFilePicker?: unknown })
      .showOpenFilePicker === "function",
  source: null,
  lastFingerprint: null,
};

const DEFAULT_URL =
  "https://wiki.kimleo.net/static/file/doc/Swift-Embrace-Change.pdf";

const viewer = document.getElementById("viewer") as HTMLElement;
const statusEl = document.getElementById("status") as HTMLElement;
const envEl = document.getElementById("env") as HTMLElement;
const urlInput = document.getElementById("urlInput") as HTMLInputElement;

urlInput.value = DEFAULT_URL;

function log(message: string) {
  statusEl.textContent = message;
  console.log("[spike]", message);
}

function setEnv() {
  envEl.textContent = [
    `pdfjs ${pdfjsLib.version}`,
    `workerPort ${pdfjsLib.GlobalWorkerOptions.workerPort ? "set" : "none"}`,
    `FSA ${state.fsaSupported ? "supported" : "unsupported"}`,
  ].join(" | ");
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function fingerprint(
  bytes: ArrayBuffer,
  sampleSize = 65536,
): Promise<{
  size: number;
  sampleBytes: number;
  hash: string;
}> {
  const u8 = new Uint8Array(bytes);
  const size = u8.byteLength;
  const head = u8.slice(0, Math.min(sampleSize, size));
  const tail = u8.slice(Math.max(0, size - sampleSize));
  const payload = new Uint8Array(8 + head.length + tail.length);
  new DataView(payload.buffer).setFloat64(0, size);
  payload.set(head, 8);
  payload.set(tail, 8 + head.length);
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return { size, sampleBytes: head.length + tail.length, hash: hex(digest) };
}

function clearViewer() {
  viewer.replaceChildren();
}

async function renderPage(pageNumber: number): Promise<void> {
  if (!state.doc) {
    throw new Error("No document loaded");
  }
  const page = await state.doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: state.scale });

  clearViewer();

  const pageEl = document.createElement("div");
  pageEl.className = "page";
  pageEl.dataset.page = String(pageNumber);
  pageEl.style.width = `${viewport.width}px`;
  pageEl.style.height = `${viewport.height}px`;
  pageEl.style.setProperty("--total-scale-factor", String(viewport.scale));
  pageEl.style.setProperty("--scale-factor", String(viewport.scale));

  const canvas = document.createElement("canvas");
  const outputScale = window.devicePixelRatio || 1;
  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  const transform =
    outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;
  await page.render({ canvas, viewport, transform }).promise;

  const textContent = await page.getTextContent();
  const textLayerEl = document.createElement("div");
  textLayerEl.className = "textLayer";
  const textLayer = new pdfjsLib.TextLayer({
    textContentSource: textContent,
    container: textLayerEl,
    viewport,
  });
  await textLayer.render();

  const overlayEl = document.createElement("div");
  overlayEl.className = "overlayLayer";

  pageEl.append(canvas, textLayerEl, overlayEl);
  viewer.append(pageEl);
  state.currentPage = pageNumber;
}

function collectTextNodes(root: HTMLElement): { nodes: Text[]; text: string } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let text = "";
  let node: Node | null = walker.nextNode();
  while (node) {
    const textNode = node as Text;
    nodes.push(textNode);
    text += textNode.data;
    node = walker.nextNode();
  }
  return { nodes, text };
}

function offsetToNode(
  nodes: Text[],
  offset: number,
): { node: Text; offset: number } | null {
  let acc = 0;
  for (const node of nodes) {
    const len = node.data.length;
    if (offset <= acc + len) {
      return { node, offset: offset - acc };
    }
    acc += len;
  }
  return null;
}

async function selectByText(
  target: string,
  pageNumber = state.currentPage,
): Promise<SelectionInfo | null> {
  const pageEl = viewer.querySelector<HTMLElement>(
    `.page[data-page="${pageNumber}"]`,
  );
  if (!pageEl) {
    return null;
  }
  const textLayer = pageEl.querySelector<HTMLElement>(".textLayer");
  if (!textLayer) {
    return null;
  }
  const { nodes, text } = collectTextNodes(textLayer);
  const index = text.indexOf(target);
  if (index < 0) {
    return null;
  }
  const start = offsetToNode(nodes, index);
  const end = offsetToNode(nodes, index + target.length);
  if (!start || !end) {
    return null;
  }
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);

  const pageRect = pageEl.getBoundingClientRect();
  const rects = Array.from(range.getClientRects()).map((r) => ({
    x: r.left - pageRect.left,
    y: r.top - pageRect.top,
    width: r.width,
    height: r.height,
  }));
  return { page: pageNumber, text: range.toString(), rects };
}

function drawHighlight(
  rects: RectInfo[],
  pageNumber = state.currentPage,
): number {
  const pageEl = viewer.querySelector<HTMLElement>(
    `.page[data-page="${pageNumber}"]`,
  );
  const overlay = pageEl?.querySelector<HTMLElement>(".overlayLayer");
  if (!overlay) {
    return 0;
  }
  overlay.replaceChildren();
  rects.forEach((r) => {
    const div = document.createElement("div");
    div.className = "myz-hl";
    div.style.left = `${r.x}px`;
    div.style.top = `${r.y}px`;
    div.style.width = `${r.width}px`;
    div.style.height = `${r.height}px`;
    overlay.append(div);
  });
  return rects.length;
}

function countOverlays(): number {
  return viewer.querySelectorAll(".myz-hl").length;
}

async function loadUrl(url: string): Promise<{ pages: number }> {
  log(`loading url: ${url}`);
  const doc = await pdfjsLib.getDocument({ url }).promise;
  state.doc = doc;
  state.source = url;
  await renderPage(1);
  log(`loaded url, pages=${doc.numPages}`);
  return { pages: doc.numPages };
}

async function loadBytes(
  bytes: ArrayBuffer,
  label = "bytes",
): Promise<{ pages: number; fingerprint: string }> {
  const fp = await fingerprint(bytes);
  state.lastFingerprint = fp.hash;
  const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
  state.doc = doc;
  state.source = label;
  await renderPage(1);
  log(
    `loaded ${label}, pages=${doc.numPages}, fp=${fp.hash.slice(0, 12)}… (${fp.size}B)`,
  );
  return { pages: doc.numPages, fingerprint: fp.hash };
}

type PermissionStatus = "granted" | "denied" | "prompt";

interface PermissionCapableHandle {
  queryPermission?(desc: {
    mode: "read" | "readwrite";
  }): Promise<PermissionStatus>;
  requestPermission?(desc: {
    mode: "read" | "readwrite";
  }): Promise<PermissionStatus>;
  getFile(): Promise<File>;
}

const DB_NAME = "myz_pdf_spike";
const STORE = "handles";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putHandle(key: string, handle: unknown): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(handle, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function getHandle(key: string): Promise<unknown> {
  const db = await openDb();
  const result = await new Promise<unknown>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

async function readHandle(handle: unknown): Promise<ArrayBuffer> {
  const capable = handle as PermissionCapableHandle;
  if (capable.queryPermission) {
    const current = await capable.queryPermission({ mode: "read" });
    if (current !== "granted" && capable.requestPermission) {
      const next = await capable.requestPermission({ mode: "read" });
      if (next !== "granted") {
        throw new Error("permission denied");
      }
    }
  }
  const file = await capable.getFile();
  return file.arrayBuffer();
}

async function openLocal(): Promise<{ fingerprint: string } | null> {
  const picker = (
    window as unknown as {
      showOpenFilePicker?: (
        options: unknown,
      ) => Promise<PermissionCapableHandle[]>;
    }
  ).showOpenFilePicker;
  if (!picker) {
    log("FSA unsupported");
    return null;
  }
  const [handle] = await picker({
    types: [
      {
        description: "PDF",
        accept: { "application/pdf": [".pdf"] },
      },
    ],
  });
  const bytes = await readHandle(handle);
  const result = await loadBytes(bytes, "local-file");
  await putHandle(result.fingerprint, handle);
  return { fingerprint: result.fingerprint };
}

async function restoreLocal(): Promise<{ fingerprint: string } | null> {
  if (!state.lastFingerprint) {
    log("no fingerprint stored in session");
    return null;
  }
  const handle = await getHandle(state.lastFingerprint);
  if (!handle) {
    log(`no handle stored for ${state.lastFingerprint.slice(0, 12)}…`);
    return null;
  }
  const bytes = await readHandle(handle);
  const result = await loadBytes(bytes, "restored-local");
  return { fingerprint: result.fingerprint };
}

async function probe(url: string, query: string) {
  const { pages } = await loadUrl(url);
  const selection = await selectByText(query);
  const overlayCount = selection ? drawHighlight(selection.rects) : 0;
  return {
    pages,
    page: state.currentPage,
    selection,
    overlayCount,
  };
}

const api = {
  version: pdfjsLib.version,
  get fsaSupported() {
    return state.fsaSupported;
  },
  loadUrl,
  loadBytes,
  renderPage,
  selectByText,
  drawHighlight,
  clearOverlays: () => {
    viewer.querySelectorAll(".overlayLayer").forEach((el) => {
      el.replaceChildren();
    });
  },
  fingerprint,
  probe,
  getState: () => ({
    pages: state.doc?.numPages ?? 0,
    currentPage: state.currentPage,
    source: state.source,
    fsaSupported: state.fsaSupported,
    pdfjsVersion: pdfjsLib.version,
    overlayCount: countOverlays(),
    fingerprint: state.lastFingerprint,
  }),
};

(window as unknown as { __SPIKE__: typeof api }).__SPIKE__ = api;

document.getElementById("loadUrl")?.addEventListener("click", () => {
  void loadUrl(urlInput.value.trim()).catch((e) => log(`error: ${e}`));
});
document.getElementById("openLocal")?.addEventListener("click", () => {
  void openLocal().catch((e) => log(`error: ${e}`));
});
document.getElementById("restoreLocal")?.addEventListener("click", () => {
  void restoreLocal().catch((e) => log(`error: ${e}`));
});
document.getElementById("fingerprint")?.addEventListener("click", () => {
  const fp = state.lastFingerprint;
  log(fp ? `fingerprint: ${fp}` : "no document loaded");
});
document.getElementById("clear")?.addEventListener("click", () => {
  state.doc = null;
  state.source = null;
  clearViewer();
  log("cleared");
});

if (!state.fsaSupported) {
  const openBtn = document.getElementById("openLocal") as HTMLButtonElement;
  const restoreBtn = document.getElementById(
    "restoreLocal",
  ) as HTMLButtonElement;
  openBtn.disabled = true;
  restoreBtn.disabled = true;
}

setEnv();
log("ready");
