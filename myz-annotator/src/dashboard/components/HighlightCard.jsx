import { computed, defineComponent } from "vue";
import { RECORD_KINDS } from "../utils/records.js";
import { useDashboardStore } from "../store/useDashboardStore.js";

export default defineComponent({
  name: "HighlightCard",
  props: {
    record: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    const store = useDashboardStore();
    const kind = computed(() => store.getRecordKind(props.record));
    const hasNote = computed(() => Boolean(props.record?.note));
    const archiveLink = computed(() => {
      const record = props.record || {};
      return record.archiveSnapshotUrl || record.archiveUrl || "";
    });

    const kindLabel = computed(() => {
      const kind = store.getRecordKind(props.record);
      switch (kind) {
        case RECORD_KINDS.CLIP:
          return "保存文字";
        case RECORD_KINDS.AI_GENERATED:
          return "AI摘录";
        default:
          return "划线标注";
      }
    });

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
      const cardClasses = ["card"];
      if (kind.value === RECORD_KINDS.CLIP) {
        cardClasses.push("card--clip");
      }
      if (kind.value === RECORD_KINDS.AI_GENERATED) {
        cardClasses.push("card--ai");
      }
      if (!hasNote.value) {
        cardClasses.push("card--single");
      }
      return (
        <article
          class={cardClasses.join(" ")}
          data-id={record.id}
          data-kind={kind.value}
        >
          <div class="card__header">
            <div
              class="card__badge"
              style={
                kind.value === RECORD_KINDS.AI_GENERATED
                  ? "background: #7c3aed; color: white;"
                  : ""
              }
            >
              {kindLabel.value}
            </div>
            <div class="card__meta">
              <span
                class="card__site"
                innerHTML={store.formatInline(
                  record.hostname || record.url || "",
                )}
              ></span>
              <span class="card__date">
                {store.formatDateTime(record.createdAt)}
              </span>
            </div>
          </div>
          <div class="card__content">
            <section
              class={
                "card__segment card__segment--quote" +
                (kind.value === RECORD_KINDS.CLIP ? " card__segment--clip" : "")
              }
            >
              <h4 class="card__segment-title">{kindLabel.value}</h4>
              <blockquote
                class="card__quote"
                innerHTML={store.renderHighlight(record)}
              ></blockquote>
            </section>
            <section
              class={
                "card__segment card__segment--note" +
                (hasNote.value ? "" : " is-empty")
              }
            >
              <h4>批注</h4>
              <p
                class="card__note"
                innerHTML={hasNote.value ? store.formatNote(record.note) : ""}
              ></p>
            </section>
          </div>
          <div
            class={
              "card__tags" +
              (record.tags && record.tags.length ? "" : " is-empty")
            }
          >
            {(record.tags || []).map((tag) => (
              <span key={tag} innerHTML={store.formatInline(tag)}></span>
            ))}
          </div>
          <div class="card__footer">
            {archiveLink.value ? (
              <a
                class="btn-link"
                href={archiveLink.value}
                target="_blank"
                rel="noopener"
                title="存档"
              >
                存档
              </a>
            ) : null}
            <a
              class="btn-link"
              href={record.sourceUrl || record.url}
              target="_blank"
              rel="noopener"
              title={record.title || record.url}
            >
              页面
            </a>
            <button
              class="btn-link"
              type="button"
              onClick={() => handleAction("view")}
            >
              查看
            </button>
            <button
              class="btn-link"
              type="button"
              onClick={() => handleAction("edit")}
            >
              编辑
            </button>
            <button
              class="btn-link"
              type="button"
              onClick={() => handleAction("copy")}
            >
              复制
            </button>
            <button
              class={
                "btn-link btn-link--muted" +
                (kind.value === RECORD_KINDS.HIGHLIGHT ? "" : " is-hidden")
              }
              type="button"
              onClick={() => handleAction("downgrade")}
            >
              降级
            </button>
            <button
              class="btn-link btn-link--danger"
              type="button"
              onClick={() => handleAction("delete")}
            >
              删除
            </button>
          </div>
        </article>
      );
    };
  },
});
