import { storeToRefs } from "pinia";
import { defineComponent } from "vue";
import { useReaderStore } from "../stores/reader-store.js";

export default defineComponent({
  name: "PdfLanding",
  setup() {
    const store = useReaderStore();
    const { recents } = storeToRefs(store);

    return () => (
      <section class="reader-landing">
        <h1>MyZ PDF 阅读器</h1>
        <p>打开本地 PDF，或从下方继续上次阅读。</p>
        <button
          class="reader-landing__cta"
          type="button"
          onClick={store.openLocal}
        >
          打开本地 PDF
        </button>
        {recents.value.length ? (
          <ul class="reader-recents">
            {recents.value.map((entry) => (
              <li key={entry.sourceKey || entry.fingerprint}>
                <button type="button" onClick={() => store.openRecent(entry)}>
                  <span class="reader-recents__title">
                    {entry.title || entry.url || "未命名 PDF"}
                  </span>
                  <span class="reader-recents__meta">
                    {entry.pages ? `第 ${entry.page} / ${entry.pages} 页` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    );
  },
});
