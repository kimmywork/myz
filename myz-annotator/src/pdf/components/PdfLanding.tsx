import { storeToRefs } from "pinia";
import { computed, defineComponent } from "vue";
import { useReaderStore } from "../stores/reader-store.js";
import { openLibrary } from "@/reader/open-library.js";
import ReaderLanding, { type ReaderRecent } from "@/reader/ReaderLanding.js";

export default defineComponent({
  name: "PdfLanding",
  setup() {
    const store = useReaderStore();
    const { recents } = storeToRefs(store);

    const keyOf = (entry: {
      sourceKey?: string;
      fingerprint?: string;
      url?: string;
    }) => entry.sourceKey || entry.fingerprint || entry.url || "";

    const items = computed<ReaderRecent[]>(() =>
      recents.value.map((entry) => ({
        key: keyOf(entry),
        title: entry.title || entry.url || "未命名 PDF",
        meta: entry.pages ? `第 ${entry.page} / ${entry.pages} 页` : "",
      })),
    );

    return () => (
      <ReaderLanding
        title="MyZ PDF 阅读器"
        subtitle="打开本地 PDF，或从下方继续上次阅读。"
        openLabel="打开本地 PDF"
        recents={items.value}
        onOpen={store.openLocal}
        onBack={openLibrary}
        onOpenRecent={(key) => {
          const entry = recents.value.find((item) => keyOf(item) === key);
          if (entry) {
            void store.openRecent(entry);
          }
        }}
      />
    );
  },
});
