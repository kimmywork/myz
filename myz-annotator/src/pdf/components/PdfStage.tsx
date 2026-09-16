import { onBeforeUnmount, onMounted, ref, defineComponent } from "vue";
import { useReaderStore } from "../stores/reader-store.js";

/**
 * Scroll container for the continuous page list. Pages are created and painted
 * imperatively by the store; this component only guarantees the element exists
 * and hands it to the store.
 */
export default defineComponent({
  name: "PdfStage",
  setup() {
    const store = useReaderStore();
    const el = ref<HTMLElement | null>(null);

    onMounted(() => store.attachStage(el.value));
    onBeforeUnmount(() => store.detachStage());

    return () => <main class="reader-stage" ref={el} />;
  },
});
