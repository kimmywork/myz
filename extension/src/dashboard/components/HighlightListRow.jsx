import { computed, defineComponent } from "vue";
import { RECORD_KINDS } from "../constants.js";
import { useDashboardStore } from "../store/useDashboardStore.js";

export default defineComponent({
  name: "HighlightListRow",
  props: {
    record: {
      type: Object,
      required: true
    }
  },
  setup(props) {
    const store = useDashboardStore();
    const kind = computed(() => store.getRecordKind(props.record));

    function handleAction(action) {
      const id = props.record?.id;
      if (!id) {
        return;
      }
      switch (action) {
        case "copy":
          store.copyHighlight(id);
          break;
        case "delete":
          store.deleteHighlight(id);
          break;
        case "view":
          store.openModal(id, "view");
          break;
        case "edit":
          store.openModal(id, "edit");
          break;
        case "downgrade":
          store.downgradeHighlight(id);
          break;
        default:
          break;
      }
    }

    return () => {
      const record = props.record;
      if (!record) {
        return null;
      }
      const rowClasses = ["list-row"];
      if (kind.value === RECORD_KINDS.CLIP) {
        rowClasses.push("list-row--clip");
      }
      return (
        <div class={rowClasses.join(" ")} data-id={record.id} data-kind={kind.value}>
          <div class="list-row__meta">
            <span class="list-row__site" innerHTML={store.formatInline(record.hostname || record.url || "")}></span>
            <span class="list-row__badge">{kind.value === RECORD_KINDS.CLIP ? "保存文字" : "划线标注"}</span>
            <span class={"list-row__tags" + ((record.tags && record.tags.length) ? "" : " is-empty")}>
              {record.tags && record.tags.length ? record.tags.join(" · ") : ""}
            </span>
            <span class="list-row__date">{store.formatDateTime(record.createdAt)}</span>
          </div>
          <div class="list-row__content">
            <div class="list-row__quote" innerHTML={store.renderHighlight(record)}></div>
            <div class={"list-row__note" + (record.note ? "" : " is-empty")} innerHTML={record.note ? store.formatNote(record.note) : ""}></div>
          </div>
          <div class="list-row__actions">
            <a class="btn-link" href={record.sourceUrl || record.url} target="_blank" rel="noopener" title={record.title || record.url}>
              打开页面
            </a>
            <button class="btn-link" type="button" onClick={() => handleAction("view")}>
              查看
            </button>
            <button class="btn-link" type="button" onClick={() => handleAction("edit")}>
              编辑
            </button>
            <button class="btn-link" type="button" onClick={() => handleAction("copy")}>
              复制
            </button>
            <button
              class={"btn-link btn-link--muted" + (kind.value === RECORD_KINDS.HIGHLIGHT ? "" : " is-hidden")}
              type="button"
              onClick={() => handleAction("downgrade")}
            >
              降级为保存
            </button>
            <button class="btn-link btn-link--danger" type="button" onClick={() => handleAction("delete")}>删除</button>
          </div>
        </div>
      );
    };
  }
});
