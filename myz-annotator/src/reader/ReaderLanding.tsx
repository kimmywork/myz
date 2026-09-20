import { defineComponent } from "vue";
import type { PropType } from "vue";

export interface ReaderRecent {
  key: string;
  title: string;
  meta: string;
}

/**
 * Shared reader landing (design-system §6 empty state): the same shell for the
 * PDF and EPUB readers — a back link to the library, the reader name, an
 * "open local" action, and the recent documents for that reader.
 */
export default defineComponent({
  name: "ReaderLanding",
  props: {
    title: { type: String, required: true },
    subtitle: { type: String, default: "" },
    openLabel: { type: String, required: true },
    recents: {
      type: Array as PropType<ReaderRecent[]>,
      default: () => [],
    },
    onOpen: {
      type: Function as PropType<() => void>,
      default: undefined,
    },
    onOpenRecent: {
      type: Function as PropType<(key: string) => void>,
      default: undefined,
    },
    onBack: {
      type: Function as PropType<() => void>,
      default: undefined,
    },
  },
  setup(props) {
    return () => (
      <section class="reader-landing">
        {props.onBack ? (
          <div class="reader-landing__top">
            <button
              type="button"
              class="reader-btn"
              onClick={() => props.onBack?.()}
            >
              返回文库
            </button>
          </div>
        ) : null}
        <h1>{props.title}</h1>
        {props.subtitle ? <p>{props.subtitle}</p> : null}
        <button
          type="button"
          class="reader-btn"
          onClick={() => props.onOpen?.()}
        >
          {props.openLabel}
        </button>
        {props.recents.length ? (
          <ul class="reader-recents">
            {props.recents.map((entry) => (
              <li key={entry.key}>
                <button
                  type="button"
                  class="reader-btn"
                  onClick={() => props.onOpenRecent?.(entry.key)}
                >
                  <span class="reader-recents__title">{entry.title}</span>
                  <span class="reader-recents__meta">{entry.meta}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    );
  },
});
