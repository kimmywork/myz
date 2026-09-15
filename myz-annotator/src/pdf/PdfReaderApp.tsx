import { normalizeRecord } from "@myz/shared/highlightUtils";
import { sendMessage } from "@myz/shared/messaging";
import {
  CONTENT_TYPES,
  DEFAULT_COLORS,
  DEFAULT_COLOR,
  HIGHLIGHT_STYLE_OPTIONS,
  HIGHLIGHT_STYLES,
  RECORD_KINDS,
  SOURCE_TYPES,
  type MyZRecord,
} from "@myz/shared/types";
import { extractHostname } from "@myz/shared/url";
import {
  computed,
  defineComponent,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import {
  countPageAnnotations,
  extractSelection,
  renderOverlays,
  selectTextInPage,
  type PdfSelection,
} from "./annotations.js";
import { fingerprintPdf } from "./fingerprint.js";
import {
  getPageSize,
  loadPdfFromBytes,
  loadPdfFromUrl,
  renderPageInto,
  type PdfDocument,
} from "./pdf-document.js";
import {
  titleFromPdfUrl,
  pickLocalPdf,
  restoreLocalPdf,
  sourceKeyOf,
  sourceTypeOf,
  supportsFileSystemAccess,
  type PdfSourceRef,
} from "./source.js";
import {
  getProgress,
  listProgress,
  saveProgress,
  type PdfProgress,
} from "./storage.js";
import type { Settings } from "@/background/settings.js";

type ReaderStatus = "landing" | "loading" | "ready" | "error";

const DEFAULT_SCALE = 1.5;
const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

export default defineComponent({
  name: "PdfReaderApp",
  setup() {
    const status = ref<ReaderStatus>("landing");
    const error = ref("");
    const page = ref(1);
    const pages = ref(0);
    const label = ref("");
    const recents = ref<PdfProgress[]>([]);
    const persistedPage = ref(0);
    const scale = ref(DEFAULT_SCALE);
    const stageRef = ref<HTMLElement | null>(null);

    const annotations = ref<MyZRecord[]>([]);
    const activeId = ref<string | null>(null);
    const selection = ref<PdfSelection | null>(null);
    const selectionPos = ref({ top: 0, left: 0 });
    const noteDraft = ref("");
    const tagsDraft = ref("");
    const dirty = ref(false);
    const savedAt = ref<number | null>(null);
    const lastStyle = ref<HIGHLIGHT_STYLES>(HIGHLIGHT_STYLES.PAINT);
    const lastColor = ref<string>(DEFAULT_COLOR);

    let doc: PdfDocument | null = null;
    let current: PdfSourceRef | null = null;
    let observer: IntersectionObserver | null = null;
    let persistTimer: number | null = null;
    let activeRenders = 0;
    let scrollCheckPending = false;
    const rendered = new Set<number>();

    const activeRecord = computed(
      () =>
        annotations.value.find((item) => item.id === activeId.value) ?? null,
    );

    const styleOptions = Object.values(HIGHLIGHT_STYLE_OPTIONS).map(
      (option) => ({
        style: option.icon as HIGHLIGHT_STYLES,
        label: option.label,
      }),
    );

    watch(activeId, () => {
      const record = activeRecord.value;
      noteDraft.value = record?.note || "";
      tagsDraft.value = (record?.tags || []).join(", ");
      dirty.value = false;
      savedAt.value = null;
    });

    function setError(message: string) {
      error.value = message;
      status.value = "error";
    }

    function pageElements(): HTMLElement[] {
      const stage = stageRef.value;
      if (!stage) {
        return [];
      }
      return Array.from(stage.querySelectorAll<HTMLElement>(".pdf-page"));
    }

    function redrawOverlays() {
      const active = activeId.value;
      pageElements().forEach((el) =>
        renderOverlays(el, annotations.value, active),
      );
    }

    async function persistProgress() {
      if (!current) {
        return;
      }
      const entry: PdfProgress = {
        sourceKey: sourceKeyOf(current),
        sourceType: sourceTypeOf(current),
        page: page.value,
        pages: pages.value,
        title: label.value,
        updatedAt: new Date().toISOString(),
      };
      if (current.kind === "web") {
        entry.url = current.url;
      } else {
        entry.fingerprint = current.fingerprint;
      }
      await saveProgress(entry);
      persistedPage.value = entry.page;
    }

    function schedulePersist() {
      if (persistTimer !== null) {
        clearTimeout(persistTimer);
      }
      persistTimer = window.setTimeout(() => {
        void persistProgress();
      }, 300);
    }

    async function ensureRendered(pageNumber: number) {
      if (!doc || rendered.has(pageNumber)) {
        return;
      }
      const stage = stageRef.value;
      const el = stage?.querySelector<HTMLElement>(
        `.pdf-page[data-page="${pageNumber}"]`,
      );
      if (!el) {
        return;
      }
      rendered.add(pageNumber);
      activeRenders += 1;
      try {
        await renderPageInto(el, doc, pageNumber, scale.value);
        renderOverlays(el, annotations.value, activeId.value);
      } catch (renderError) {
        rendered.delete(pageNumber);
        console.error("Failed to render page", pageNumber, renderError);
      } finally {
        activeRenders -= 1;
        if (activeRenders === 0 && scrollCheckPending) {
          scrollCheckPending = false;
          updateCurrentPage();
        }
      }
    }

    function computeCurrentPage(): number {
      const stage = stageRef.value;
      if (!stage) {
        return page.value;
      }
      const middle = stage.getBoundingClientRect().top + stage.clientHeight / 2;
      const elements = pageElements();
      for (const el of elements) {
        if (middle < el.getBoundingClientRect().bottom) {
          return Number(el.dataset.page || 1);
        }
      }
      return elements.length
        ? Number(elements[elements.length - 1].dataset.page || pages.value)
        : 1;
    }

    function updateCurrentPage() {
      const next = computeCurrentPage();
      if (next !== page.value) {
        page.value = next;
        schedulePersist();
      }
    }

    function handleScroll() {
      // Ignore transient layout shifts while pages are still rendering;
      // re-check once rendering settles.
      if (activeRenders > 0) {
        scrollCheckPending = true;
        return;
      }
      updateCurrentPage();
    }

    async function goToPage(target: number) {
      if (!doc) {
        return;
      }
      const stage = stageRef.value;
      if (!stage) {
        return;
      }
      const next = Math.min(Math.max(1, target), pages.value || 1);
      await ensureRendered(next);
      const el = stage.querySelector<HTMLElement>(
        `.pdf-page[data-page="${next}"]`,
      );
      if (el) {
        const delta =
          el.getBoundingClientRect().top - stage.getBoundingClientRect().top;
        stage.scrollTop += delta;
      }
      page.value = next;
      await persistProgress();
      void ensureRendered(next + 1);
      if (next > 1) {
        void ensureRendered(next - 1);
      }
    }

    function observePages() {
      const stage = stageRef.value;
      if (!stage) {
        return;
      }
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              const number = Number((entry.target as HTMLElement).dataset.page);
              void ensureRendered(number);
            }
          }
        },
        { root: stage, rootMargin: "800px 0px" },
      );
      pageElements().forEach((el) => observer?.observe(el));
    }

    async function buildPages(preservePage: number) {
      const stage = stageRef.value;
      if (!stage || !doc) {
        return;
      }
      observer?.disconnect();
      observer = null;
      rendered.clear();
      stage.replaceChildren();
      const base = await getPageSize(doc, 1, scale.value);
      for (let index = 1; index <= pages.value; index += 1) {
        const el = document.createElement("div");
        el.className = "pdf-page";
        el.dataset.page = String(index);
        el.style.width = `${base.width}px`;
        el.style.height = `${base.height}px`;
        stage.append(el);
      }
      observePages();
      await ensureRendered(preservePage);
      await goToPage(preservePage);
    }

    async function loadPreferences() {
      try {
        const settings = await sendMessage<undefined, Settings>(
          "myz:getSettings",
        );
        if (settings?.lastUsedStyle) {
          lastStyle.value = settings.lastUsedStyle;
        }
        if (settings?.lastUsedColor) {
          lastColor.value = settings.lastUsedColor;
        }
      } catch (err) {
        console.warn("Failed to load highlight preferences", err);
      }
    }

    async function loadAnnotations() {
      if (!current) {
        return;
      }
      try {
        const records = await sendMessage<{ url: string }, MyZRecord[]>(
          "myz:getHighlightsForUrl",
          { url: sourceKeyOf(current) },
        );
        annotations.value = (records || [])
          .map((record) => normalizeRecord(record))
          .filter((record): record is MyZRecord => Boolean(record));
      } catch (err) {
        console.error("Failed to load annotations", err);
        annotations.value = [];
      }
      redrawOverlays();
    }

    async function loadDocument(nextDoc: PdfDocument, ref: PdfSourceRef) {
      doc = nextDoc;
      current = ref;
      pages.value = nextDoc.numPages;
      label.value = ref.title;
      activeId.value = null;
      selection.value = null;
      annotations.value = [];
      const progress = await getProgress(sourceKeyOf(ref));
      const start =
        progress && progress.page >= 1 && progress.page <= nextDoc.numPages
          ? progress.page
          : 1;
      await buildPages(start);
      await loadAnnotations();
      status.value = "ready";
    }

    function zoomStep(direction: "in" | "out") {
      if (!doc || status.value !== "ready") {
        return;
      }
      const sorted = [...ZOOM_LEVELS].sort((a, b) => a - b);
      const target =
        direction === "in"
          ? (sorted.find((level) => level > scale.value + 1e-6) ??
            sorted[sorted.length - 1])
          : ([...sorted]
              .reverse()
              .find((level) => level < scale.value - 1e-6) ?? sorted[0]);
      if (target === scale.value) {
        return;
      }
      scale.value = target;
      void buildPages(page.value);
    }

    const zoomIn = () => zoomStep("in");
    const zoomOut = () => zoomStep("out");
    const zoomPercent = () => `${Math.round(scale.value * 100)}%`;

    function applyCurrentSelection() {
      if (!stageRef.value) {
        return;
      }
      const next = extractSelection(stageRef.value);
      if (!next) {
        selection.value = null;
        return;
      }
      const range = window.getSelection()?.getRangeAt(0);
      const rect = range?.getBoundingClientRect();
      selection.value = next;
      selectionPos.value = rect
        ? { top: rect.top - 8, left: rect.left + rect.width / 2 }
        : { top: 160, left: 240 };
    }

    function handleStageMouseUp(event: MouseEvent) {
      if ((event.target as HTMLElement)?.closest(".pdf-annotation")) {
        return;
      }
      window.setTimeout(applyCurrentSelection, 0);
    }

    function handleStageClick(event: MouseEvent) {
      const target = (event.target as HTMLElement)?.closest(
        ".pdf-annotation",
      ) as HTMLElement | null;
      if (target?.dataset.id) {
        activeId.value = target.dataset.id;
        selection.value = null;
        redrawOverlays();
      }
    }

    async function createAnnotation(kind: RECORD_KINDS) {
      const next = selection.value;
      if (!next || !current) {
        return;
      }
      const isHighlight = kind === RECORD_KINDS.HIGHLIGHT;
      const sourceKey = sourceKeyOf(current);
      const payload: Partial<MyZRecord> = {
        kind,
        text: next.text,
        url: sourceKey,
        sourceUrl: sourceKey,
        title: label.value,
        hostname:
          current.kind === "web" ? extractHostname(current.url) : "本地文件",
        sourceType: sourceTypeOf(current),
        contentType: CONTENT_TYPES.PLAIN,
        pdfLocator: {
          pageNumber: next.pageNumber,
          text: next.text,
          occurrenceIndex: next.occurrenceIndex,
          rects: next.rects,
        },
      };
      if (isHighlight) {
        payload.color = lastColor.value;
        payload.style = lastStyle.value;
      }
      const saved = await sendMessage<Partial<MyZRecord>, MyZRecord>(
        "myz:saveHighlight",
        payload,
      );
      const normalized = normalizeRecord(saved);
      if (normalized) {
        annotations.value = [
          ...annotations.value.filter((item) => item.id !== normalized.id),
          normalized,
        ];
        activeId.value = normalized.id;
      }
      selection.value = null;
      window.getSelection()?.removeAllRanges();
      redrawOverlays();
    }

    async function patchActive(patch: Partial<MyZRecord>) {
      if (!activeId.value) {
        return;
      }
      const updated = await sendMessage<Partial<MyZRecord>, MyZRecord>(
        "myz:updateHighlight",
        { id: activeId.value, ...patch },
      );
      const normalized = normalizeRecord(updated);
      if (normalized) {
        annotations.value = annotations.value.map((item) =>
          item.id === normalized.id ? normalized : item,
        );
      }
      if (patch.style) {
        lastStyle.value = patch.style as HIGHLIGHT_STYLES;
      }
      if (patch.color) {
        lastColor.value = patch.color;
      }
      savedAt.value = Date.now();
      dirty.value = false;
      redrawOverlays();
    }

    async function deleteActive() {
      if (!activeId.value) {
        return;
      }
      const id = activeId.value;
      await sendMessage("myz:removeHighlight", { id });
      annotations.value = annotations.value.filter((item) => item.id !== id);
      activeId.value = null;
      redrawOverlays();
    }

    function commitActive() {
      const record = activeRecord.value;
      if (!record) {
        return;
      }
      const tags = tagsDraft.value
        .split(/[,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean);
      const sameTags =
        (record.tags || []).length === tags.length &&
        (record.tags || []).every((tag, index) => tag === tags[index]);
      const patch: Partial<MyZRecord> = {};
      if ((record.note || "") !== noteDraft.value) {
        patch.note = noteDraft.value;
      }
      if (!sameTags) {
        patch.tags = tags;
      }
      if (Object.keys(patch).length > 0) {
        void patchActive(patch);
      } else {
        dirty.value = false;
        savedAt.value = Date.now();
      }
    }

    function savedLabel() {
      if (dirty.value) {
        return "未保存";
      }
      if (savedAt.value) {
        return `已保存 ${new Date(savedAt.value).toLocaleTimeString()}`;
      }
      return "";
    }

    async function openWeb(url: string) {
      status.value = "loading";
      error.value = "";
      label.value = titleFromPdfUrl(url);
      try {
        const nextDoc = await loadPdfFromUrl(url);
        await loadDocument(nextDoc, {
          kind: "web",
          url,
          title: titleFromPdfUrl(url),
        });
      } catch (err) {
        setError((err as Error)?.message || "无法加载该 PDF");
      }
    }

    async function openBytes(bytes: ArrayBuffer, name = "本地 PDF") {
      const fingerprint = await fingerprintPdf(bytes);
      const nextDoc = await loadPdfFromBytes(bytes);
      await loadDocument(nextDoc, {
        kind: "local",
        fingerprint: fingerprint.hash,
        title: name,
      });
      return fingerprint.hash;
    }

    async function openLocal() {
      if (!supportsFileSystemAccess()) {
        setError("当前浏览器不支持打开本地文件");
        return;
      }
      status.value = "loading";
      error.value = "";
      try {
        const picked = await pickLocalPdf();
        if (!picked) {
          status.value = doc ? "ready" : "landing";
          return;
        }
        const nextDoc = await loadPdfFromBytes(picked.bytes);
        await loadDocument(nextDoc, picked.ref);
      } catch (err) {
        setError((err as Error)?.message || "无法打开本地 PDF");
      }
    }

    async function openRecent(entry: PdfProgress) {
      if (entry.sourceType === SOURCE_TYPES.PDF && entry.fingerprint) {
        status.value = "loading";
        error.value = "";
        try {
          const restored = await restoreLocalPdf(
            entry.fingerprint,
            entry.title,
          );
          if (!restored) {
            setError("找不到该本地文件，请重新打开");
            return;
          }
          const nextDoc = await loadPdfFromBytes(restored.bytes);
          await loadDocument(nextDoc, restored.ref);
        } catch (err) {
          setError((err as Error)?.message || "无法打开本地 PDF");
        }
        return;
      }
      if (entry.url) {
        await openWeb(entry.url);
      }
    }

    async function refreshRecents() {
      recents.value = (await listProgress()).slice(0, 8);
    }

    async function applyInitialPage(target: number) {
      if (Number.isFinite(target) && target > 0) {
        await goToPage(target);
      }
    }

    async function init() {
      const params = new URLSearchParams(window.location.search);
      const url = params.get("url");
      const fingerprint = params.get("fp");
      const open = params.get("open");
      const targetPage = Number(params.get("page") || "");
      await refreshRecents();
      await loadPreferences();
      if (url) {
        await openWeb(url);
        await applyInitialPage(targetPage);
        return;
      }
      if (fingerprint) {
        await openRecent({
          sourceKey: "",
          sourceType: SOURCE_TYPES.PDF,
          fingerprint,
          page: 1,
          pages: 0,
          updatedAt: "",
        });
        await applyInitialPage(targetPage);
        return;
      }
      if (open === "picker") {
        await openLocal();
        return;
      }
      status.value = "landing";
    }

    function selectTextForTest(target: string, pageNumber = 1): boolean {
      const stage = stageRef.value;
      const el = stage?.querySelector<HTMLElement>(
        `.pdf-page[data-page="${pageNumber}"]`,
      );
      if (!el || !selectTextInPage(el, target)) {
        return false;
      }
      applyCurrentSelection();
      return true;
    }

    onMounted(() => {
      stageRef.value?.addEventListener("scroll", handleScroll, {
        passive: true,
      });
      stageRef.value?.addEventListener("mouseup", handleStageMouseUp);
      stageRef.value?.addEventListener("click", handleStageClick);
      void init();
    });

    onBeforeUnmount(() => {
      stageRef.value?.removeEventListener("scroll", handleScroll);
      stageRef.value?.removeEventListener("mouseup", handleStageMouseUp);
      stageRef.value?.removeEventListener("click", handleStageClick);
      observer?.disconnect();
      if (persistTimer !== null) {
        clearTimeout(persistTimer);
      }
    });

    const backdoor = {
      openUrl: openWeb,
      openBytes,
      goToPage,
      openLocal,
      zoomIn,
      zoomOut,
      selectText: selectTextForTest,
      createAnnotation,
      patchActive,
      deleteActive,
      getAnnotations: () => annotations.value,
      getActiveAnnotation: () => activeRecord.value,
      getState: () => ({
        status: status.value,
        page: page.value,
        pages: pages.value,
        label: label.value,
        rendered: rendered.size,
        persistedPage: persistedPage.value,
        scale: scale.value,
        sourceKey: current ? sourceKeyOf(current) : null,
        annotationCount: annotations.value.length,
        activeId: activeId.value,
        selectionActive: Boolean(selection.value),
        visibleOverlays: stageRef.value
          ? countPageAnnotations(
              pageElements()[0] ?? document.createElement("div"),
              annotations.value,
            )
          : 0,
      }),
    };
    (window as unknown as { __MYZ_PDF__: typeof backdoor }).__MYZ_PDF__ =
      backdoor;

    return () => (
      <div class="reader-app">
        <header class="reader-toolbar">
          <div class="reader-toolbar__group">
            <button
              type="button"
              disabled={page.value <= 1 || status.value !== "ready"}
              onClick={() => goToPage(page.value - 1)}
            >
              上一页
            </button>
            <span class="reader-pager">
              {pages.value ? `${page.value} / ${pages.value}` : "—"}
            </span>
            <button
              type="button"
              disabled={page.value >= pages.value || status.value !== "ready"}
              onClick={() => goToPage(page.value + 1)}
            >
              下一页
            </button>
          </div>
          <div class="reader-toolbar__title" title={label.value}>
            {label.value}
            {annotations.value.length
              ? ` · ${annotations.value.length} 条标注`
              : ""}
          </div>
          <div class="reader-toolbar__group">
            <button
              type="button"
              class="reader-zoom"
              aria-label="缩小"
              title="缩小"
              disabled={status.value !== "ready"}
              onClick={zoomOut}
            >
              −
            </button>
            <span class="reader-pager reader-zoom__value">{zoomPercent()}</span>
            <button
              type="button"
              class="reader-zoom"
              aria-label="放大"
              title="放大"
              disabled={status.value !== "ready"}
              onClick={zoomIn}
            >
              +
            </button>
            <button type="button" onClick={openLocal}>
              打开本地 PDF
            </button>
          </div>
        </header>

        <main class="reader-stage" ref={stageRef} />

        {selection.value ? (
          <div
            class="selection-toolbar"
            style={{
              top: `${selectionPos.value.top}px`,
              left: `${selectionPos.value.left}px`,
            }}
          >
            <button
              type="button"
              onClick={() => createAnnotation(RECORD_KINDS.HIGHLIGHT)}
            >
              高亮
            </button>
            <button
              type="button"
              onClick={() => createAnnotation(RECORD_KINDS.CLIP)}
            >
              保存文字
            </button>
            <button type="button" onClick={() => (selection.value = null)}>
              取消
            </button>
          </div>
        ) : null}

        {activeRecord.value ? (
          <aside class="reader-inspector">
            <header class="reader-inspector__head">
              <span>
                {activeRecord.value.kind === RECORD_KINDS.CLIP
                  ? "保存文字"
                  : "划线标注"}
                {activeRecord.value.pdfLocator
                  ? ` · 第 ${activeRecord.value.pdfLocator.pageNumber} 页`
                  : ""}
              </span>
              <button
                type="button"
                aria-label="关闭"
                onClick={() => (activeId.value = null)}
              >
                ×
              </button>
            </header>
            <blockquote class="reader-inspector__quote">
              {activeRecord.value.text}
            </blockquote>
            {activeRecord.value.kind === RECORD_KINDS.HIGHLIGHT ? (
              <div class="reader-inspector__row">
                <span class="reader-inspector__label">样式</span>
                {styleOptions.map((option) => (
                  <button
                    type="button"
                    class={
                      "reader-inspector__chip" +
                      (activeRecord.value?.style === option.style
                        ? " is-active"
                        : "")
                    }
                    key={option.style}
                    onClick={() => patchActive({ style: option.style })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
            {activeRecord.value.kind === RECORD_KINDS.HIGHLIGHT ? (
              <div class="reader-inspector__row">
                <span class="reader-inspector__label">颜色</span>
                {DEFAULT_COLORS.map((color) => (
                  <button
                    type="button"
                    key={color}
                    class={
                      "reader-inspector__swatch" +
                      (activeRecord.value?.color === color ? " is-active" : "")
                    }
                    style={{ background: color }}
                    aria-label={`颜色 ${color}`}
                    onClick={() => patchActive({ color })}
                  />
                ))}
              </div>
            ) : null}
            <textarea
              class="reader-inspector__note"
              placeholder="添加批注…"
              value={noteDraft.value}
              onInput={(event: Event) => {
                noteDraft.value = (event.target as HTMLTextAreaElement).value;
                dirty.value = true;
              }}
              onBlur={commitActive}
            />
            <input
              class="reader-inspector__tags"
              placeholder="标签（逗号分隔）"
              value={tagsDraft.value}
              onInput={(event: Event) => {
                tagsDraft.value = (event.target as HTMLInputElement).value;
                dirty.value = true;
              }}
              onBlur={commitActive}
            />
            <div class="reader-inspector__actions">
              <span class="reader-inspector__status">{savedLabel()}</span>
              <button
                type="button"
                class="reader-inspector__save"
                disabled={!dirty.value}
                onClick={commitActive}
              >
                保存
              </button>
              <button
                type="button"
                class="reader-inspector__delete"
                onClick={deleteActive}
              >
                删除
              </button>
            </div>
          </aside>
        ) : null}

        {status.value === "loading" ? (
          <p class="reader-status">加载中…</p>
        ) : null}
        {status.value === "error" ? (
          <p class="reader-status reader-status--error">{error.value}</p>
        ) : null}

        {status.value === "landing" ? (
          <section class="reader-landing">
            <h1>MyZ PDF 阅读器</h1>
            <p>打开本地 PDF，或从下方继续上次阅读。</p>
            <button
              class="reader-landing__cta"
              type="button"
              onClick={openLocal}
            >
              打开本地 PDF
            </button>
            {recents.value.length ? (
              <ul class="reader-recents">
                {recents.value.map((entry) => (
                  <li key={entry.sourceKey || entry.fingerprint}>
                    <button type="button" onClick={() => openRecent(entry)}>
                      <span class="reader-recents__title">
                        {entry.title || entry.url || "未命名 PDF"}
                      </span>
                      <span class="reader-recents__meta">
                        {entry.pages
                          ? `第 ${entry.page} / ${entry.pages} 页`
                          : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
      </div>
    );
  },
});
