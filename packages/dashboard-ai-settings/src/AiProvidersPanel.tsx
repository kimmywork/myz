import { defineComponent } from "vue"
import type { PropType } from "vue"
import AiProviderList from "./AiProviderList"
import type { AIProviderSetting } from "./types"

export default defineComponent({
  name: "AiProvidersPanel",
  props: {
    title: { type: String, default: "Provider" },
    description: { type: String, default: "" },
    saveNotice: { type: String, default: "" },
    selectedProviderId: {
      type: String as PropType<string | null>,
      default: null,
    },
    providers: { type: Array as PropType<AIProviderSetting[]>, required: true },
    usedByMap: {
      type: Object as PropType<Record<string, string[]>>,
      default: () => ({}),
    },
    onSelect: {
      type: Function as PropType<(id: string) => void>,
      required: true,
    },
    onAdd: { type: Function as PropType<() => void>, required: true },
    onRemove: {
      type: Function as PropType<(id: string) => void>,
      required: true,
    },
    onRename: {
      type: Function as PropType<(id: string, name: string) => void>,
      required: true,
    },
    onSave: { type: Function as PropType<() => void>, required: true },
    renderHeaderExtras: {
      type: Function as PropType<() => unknown>,
      default: null,
    },
    renderEditor: {
      type: Function as PropType<() => unknown>,
      required: true,
    },
  },
  setup(props) {
    return () => (
      <div class="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm dark:border-white/10 dark:bg-slate-800/40">
        <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="text-sm font-medium text-slate-900 dark:text-white">
              {props.title}
            </p>
            {props.description ? (
              <p class="text-xs text-slate-500 dark:text-slate-400">
                {props.description}
              </p>
            ) : null}
          </div>
          <div class="flex items-center justify-end gap-2">
            {props.renderHeaderExtras?.()}
            {props.saveNotice ? (
              <span class="text-xs text-emerald-600">{props.saveNotice}</span>
            ) : null}
            <button
              type="button"
              class="btn btn-primary whitespace-nowrap"
              onClick={props.onSave}
            >
              保存
            </button>
          </div>
        </div>

        <div class="grid gap-4 md:grid-cols-3">
          <AiProviderList
            providers={props.providers}
            selectedProviderId={props.selectedProviderId}
            usedByMap={props.usedByMap}
            onSelect={props.onSelect}
            onAdd={props.onAdd}
            onRemove={props.onRemove}
            onRename={props.onRename}
          />

          <div class="space-y-3 md:col-span-2">{props.renderEditor()}</div>
        </div>
      </div>
    )
  },
})
