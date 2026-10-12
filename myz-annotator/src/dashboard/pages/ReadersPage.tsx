import { StatePanel } from "@myz/dashboard-ui";
import { defineComponent, onMounted, ref } from "vue";
import { ensureLocalEpubPermission } from "@/epub/source.js";
import { ensureLocalPdfPermission } from "@/pdf/source.js";
import { isPdfProgress, listReaderProgress } from "@/reader/progress-store.js";

interface RecentDocument {
  key: string;
  kind: "pdf" | "epub";
  title: string;
  meta: string;
  fingerprint: string;
  page?: number;
  spineIndex?: number;
  progression?: number;
  updatedAt: string;
}

function readerUrl(entry: RecentDocument): string | null {
  if (!entry.fingerprint) {
    return null;
  }
  const base =
    entry.kind === "pdf"
      ? chrome.runtime.getURL("src/pdf/pdf-viewer.html")
      : chrome.runtime.getURL("src/epub/epub-viewer.html");
  const params = new URLSearchParams();
  params.set("fp", entry.fingerprint);
  if (entry.kind === "pdf" && entry.page) {
    params.set("page", String(entry.page));
  }
  if (entry.kind === "epub") {
    params.set("spine", String(entry.spineIndex ?? 0));
    params.set("prog", String(entry.progression ?? 0));
  }
  return `${base}?${params.toString()}`;
}

/**
 * "阅读" library page (design-system §6): a local-only shortcut list of the
 * most recently opened PDF/EPUB documents, merged from the two reader progress
 * stores. Nothing here syncs; it just reopens the local file at its last spot.
 */
export default defineComponent({
  name: "ReadersPage",
  setup() {
    const loading = ref(true);
    const documents = ref<RecentDocument[]>([]);
    const busyKey = ref("");

    async function load() {
      loading.value = true;
      try {
        const progress = await listReaderProgress().catch(() => []);
        documents.value = progress
          .filter((entry) => entry.fingerprint)
          .map((entry): RecentDocument => {
            const fingerprint = entry.fingerprint as string;
            if (isPdfProgress(entry)) {
              return {
                key: `pdf:${entry.sourceKey}`,
                kind: "pdf",
                title: entry.title || entry.url || "未命名 PDF",
                meta: entry.pages
                  ? `第 ${entry.page} / ${entry.pages} 页`
                  : "PDF",
                fingerprint,
                page: entry.page,
                updatedAt: entry.updatedAt,
              };
            }
            return {
              key: `epub:${entry.sourceKey}`,
              kind: "epub",
              title: entry.title || "未命名 EPUB",
              meta: `第 ${entry.spineIndex + 1} 章`,
              fingerprint,
              spineIndex: entry.spineIndex,
              progression: entry.progression,
              updatedAt: entry.updatedAt,
            };
          });
      } finally {
        loading.value = false;
      }
    }

    async function open(entry: RecentDocument) {
      const url = readerUrl(entry);
      if (!url || busyKey.value) {
        return;
      }
      busyKey.value = entry.key;
      try {
        // Request read permission while the click still carries activation, so
        // the freshly opened tab does not hit a permission prompt.
        if (entry.kind === "pdf") {
          await ensureLocalPdfPermission(entry.fingerprint);
        } else {
          await ensureLocalEpubPermission(entry.fingerprint);
        }
        chrome.tabs.create({ url });
      } catch (error) {
        console.warn("Failed to open document", error);
      } finally {
        busyKey.value = "";
      }
    }

    onMounted(() => void load());

    return () => (
      <section
        id="readers-view"
        class="rounded-panel border border-line bg-surface p-5 text-text dark:border-line dark:bg-surface"
        aria-labelledby="readers-title"
      >
        <header class="flex flex-col gap-2 border-b border-line pb-4 dark:border-line">
          <h2 id="readers-title" class="text-heading font-semibold text-text">
            阅读
          </h2>
          <p class="text-compact text-muted">
            最近打开的本地 PDF / EPUB，继续上次的位置。
          </p>
        </header>

        <div class="mt-4">
          {loading.value ? (
            <StatePanel kind="loading" title="正在读取…" />
          ) : documents.value.length ? (
            <ul class="space-y-3">
              {documents.value.map((entry) => (
                <li
                  key={entry.key}
                  class="settings__list-item flex items-center justify-between gap-4"
                >
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="settings__pill settings__pill--accent">
                        {entry.kind.toUpperCase()}
                      </span>
                      <span
                        class="truncate font-semibold text-text"
                        title={entry.title}
                      >
                        {entry.title}
                      </span>
                    </div>
                    <p class="mt-1 text-caption text-muted">{entry.meta}</p>
                  </div>
                  <button
                    type="button"
                    class="btn"
                    disabled={busyKey.value === entry.key}
                    onClick={() => void open(entry)}
                  >
                    {busyKey.value === entry.key ? "打开中…" : "继续阅读"}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <StatePanel
              kind="empty"
              title="还没有打开过文档"
              hint="在阅读器里打开本地 PDF 或 EPUB 后会出现在这里"
            />
          )}
        </div>
      </section>
    );
  },
});
