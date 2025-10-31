import { defineComponent, ref } from "vue";
import { useDashboardStore } from "../store/useDashboardStore.js";
import TagInput from "./TagInput.jsx";

export default defineComponent({
  name: "DashboardSidebar",
  setup() {
    const store = useDashboardStore();
    const fromRef = ref(null);
    const toRef = ref(null);

    function handlePickerClick(refTarget) {
      const input = refTarget?.value;
      if (input && typeof input.showPicker === "function") {
        input.showPicker();
      } else if (input) {
        input.focus();
      }
    }

    return () => (
      <aside class="sidebar">
        <header class="sidebar__header">
          <h1 class="sidebar__title">MyZ 标注</h1>
          <button
            class="sidebar__settings"
            type="button"
            aria-label="打开设置"
            aria-expanded={store.panel.value === "settings" ? "true" : "false"}
            onClick={() => {
              if (store.panel.value === "settings") {
                store.showHighlights();
              } else {
                store.showSettings();
              }
            }}
          >
            ⚙️
          </button>
        </header>

        <section class="sidebar__section">
          <h2>筛选</h2>
          <label class="field">
            <span>关键词</span>
            <input
              type="search"
              placeholder="搜索文本、批注或标签"
              value={store.filters.search}
              onInput={(event) => store.setFilter("search", event.target.value)}
            />
          </label>
          <label class="field">
            <span>网站</span>
            <select
              value={store.filters.site}
              onChange={(event) => store.setFilter("site", event.target.value)}
            >
              <option value="">全部网站</option>
              {store.availableSites.value.map((site) => (
                <option key={site} value={site}>
                  {site}
                </option>
              ))}
            </select>
          </label>
          <label class="field">
            <span>标签</span>
            <TagInput
              modelValue={store.filters.tags}
              options={store.availableTags.value}
              placeholder="输入后按回车或逗号确认"
              allowNew={false}
              onUpdate:modelValue={(value) => store.setFilter("tags", value)}
            />
            <small>输入后回车或逗号确认，Backspace 回删</small>
          </label>
          <div class="field field--inline">
            <label>
              <span>开始日期</span>
              <div class="date-picker">
                <input
                  ref={fromRef}
                  type="date"
                  value={store.filters.from}
                  onInput={(event) =>
                    store.setFilter("from", event.target.value)
                  }
                />
                <button
                  type="button"
                  class="btn-icon"
                  onClick={() => handlePickerClick(fromRef)}
                >
                  📅
                </button>
              </div>
            </label>
            <label>
              <span>结束日期</span>
              <div class="date-picker">
                <input
                  ref={toRef}
                  type="date"
                  value={store.filters.to}
                  onInput={(event) => store.setFilter("to", event.target.value)}
                />
                <button
                  type="button"
                  class="btn-icon"
                  onClick={() => handlePickerClick(toRef)}
                >
                  📅
                </button>
              </div>
            </label>
          </div>
          <button
            class="btn btn-secondary"
            type="button"
            onClick={store.resetFilters}
          >
            重置筛选
          </button>
        </section>

        <section class="sidebar__section">
          <h2>导出</h2>
          <button
            class="btn"
            type="button"
            onClick={() => store.handleExport("markdown")}
          >
            导出 Markdown
          </button>
          <button
            class="btn"
            type="button"
            onClick={() => store.handleExport("json")}
          >
            导出 JSON
          </button>
          <button
            class={[
              "btn",
              "btn-primary",
              store.settings.logseqSyncEnabled ? "" : "is-hidden",
            ]
              .filter(Boolean)
              .join(" ")}
            type="button"
            disabled={store.isSyncInFlight.value}
            onClick={() => store.syncLogseq({})}
          >
            同步 LogSeq
          </button>
          <p class="status-line">{store.logseqStatus.value}</p>
        </section>
      </aside>
    );
  },
});
