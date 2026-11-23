import { computed, defineComponent, onBeforeUnmount, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import DashboardWorkspaceLayout from "../components/DashboardWorkspaceLayout.jsx";
import { READER_CLOSE_MESSAGE } from "@/reader/open-library.js";

/**
 * Workspace host for an embedded reader: the reader page itself runs
 * unchanged in a same-origin iframe (same extension origin, no manifest
 * change), the workspace shell supplies the rail around it. "返回文库"
 * inside the reader posts `myz:reader-close`; the route then goes back to
 * wherever the reader was opened from.
 */
export default defineComponent({
  name: "ReaderHostPage",
  setup() {
    const route = useRoute();
    const router = useRouter();
    const kind = computed(() =>
      route.query.kind === "epub" ? ("epub" as const) : ("pdf" as const),
    );
    const src = computed(() => {
      const search = String(route.query.src || "");
      const base = chrome.runtime.getURL(
        kind.value === "epub"
          ? "src/epub/epub-viewer.html"
          : "src/pdf/pdf-viewer.html",
      );
      return search ? `${base}?${search}` : base;
    });

    function close() {
      // Back to the opening surface; a direct deep link has no workspace
      // history behind it and falls back to the reading list.
      if (window.history.state?.back) {
        router.back();
      } else {
        void router.push("/readers");
      }
    }

    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (
        (event.data as { type?: string } | null)?.type !== READER_CLOSE_MESSAGE
      )
        return;
      close();
    }

    onMounted(() => window.addEventListener("message", onMessage));
    onBeforeUnmount(() => window.removeEventListener("message", onMessage));

    return () => (
      <DashboardWorkspaceLayout>
        {{
          default: () => (
            <div class="relative h-full w-full">
              <iframe
                data-testid="reader-frame"
                class="absolute inset-0 h-full w-full border-0"
                title={kind.value === "epub" ? "EPUB 阅读器" : "PDF 阅读器"}
                src={src.value}
              />
            </div>
          ),
        }}
      </DashboardWorkspaceLayout>
    );
  },
});
