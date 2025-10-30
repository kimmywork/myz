import { defineComponent } from "vue";
import { useDashboardStore } from "../store/useDashboardStore.js";
import HighlightGroups from "./HighlightGroups.jsx";

export default defineComponent({
  name: "HighlightsPane",
  props: {
    active: {
      type: Boolean,
      default: false,
    },
  },
  setup(props) {
    const store = useDashboardStore();

    return () => (
      <section
        id="highlights-view"
        class={["main__section", props.active ? "is-active" : "is-hidden"].join(
          " ",
        )}
        aria-labelledby="highlights-title"
      >
        <header class="main__header">
          <div>
            <h2 id="highlights-title">全部记录</h2>
            <p class="summary">{store.summaryText.value}</p>
          </div>
          <div class="view-toggle" role="group" aria-label="视图切换">
            <button
              type="button"
              class={
                "btn-toggle" +
                (store.view.value === "cards" ? " is-active" : "")
              }
              onClick={() => store.setView("cards")}
            >
              卡片
            </button>
            <button
              type="button"
              class={
                "btn-toggle" + (store.view.value === "list" ? " is-active" : "")
              }
              onClick={() => store.setView("list")}
            >
              列表
            </button>
          </div>
        </header>
        <HighlightGroups />
      </section>
    );
  },
});
