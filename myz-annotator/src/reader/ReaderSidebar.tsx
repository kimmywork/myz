import { X } from "@lucide/vue";
import { defineComponent, type PropType } from "vue";

export interface ReaderSidebarTab {
  key: string;
  label: string;
  /** Rendered as `label (count)` when truthy. */
  count?: number;
}

/**
 * Docked sidebar shell shared by the PDF and EPUB readers: the tab header and
 * a body slot. The host owns the tab state and the body content, so both
 * readers keep the same chrome without duplicating the markup.
 */
export default defineComponent({
  name: "ReaderSidebar",
  props: {
    tabs: { type: Array as PropType<ReaderSidebarTab[]>, required: true },
    activeTab: { type: String, required: true },
    onSelectTab: {
      type: Function as PropType<(key: string) => void>,
      required: true,
    },
    onClose: { type: Function as PropType<() => void>, required: true },
  },
  setup(props, { slots }) {
    return () => (
      <aside class="reader-sidebar">
        <header class="reader-sidebar__head">
          <div class="reader-sidebar__tabs" role="group" aria-label="侧栏">
            {props.tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                class={
                  "reader-sidebar__tab" +
                  (props.activeTab === tab.key ? " is-active" : "")
                }
                onClick={() => props.onSelectTab(tab.key)}
              >
                {tab.label}
                {tab.count ? ` (${tab.count})` : ""}
              </button>
            ))}
          </div>
          <button
            type="button"
            class="reader-sidebar__close"
            aria-label="关闭侧栏"
            onClick={props.onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div class="reader-sidebar__body">{slots.default?.()}</div>
      </aside>
    );
  },
});
