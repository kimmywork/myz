import { AiVectorSearchSection } from "@myz/dashboard-ai-settings";
import { defineComponent } from "vue";
import { useAiSettingsContext } from "./aiSettingsContext.js";

export default defineComponent({
  name: "AiVectorSearchPage",
  setup() {
    const context = useAiSettingsContext();

    return () => (
      <div class="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm dark:border-white/10 dark:bg-slate-800/40">
        <div class="mb-3 flex items-center justify-between gap-2">
          <p class="text-sm font-medium text-slate-900 dark:text-white">
            向量检索（Vectoria）
          </p>
          <div class="flex items-center gap-2">
            {context.vectorTestNotice.value ? (
              <span class="text-xs text-slate-500 dark:text-slate-400">
                {context.vectorTestNotice.value}
              </span>
            ) : null}
            {context.vectorSaveNotice.value ? (
              <span class="text-xs text-emerald-600">
                {context.vectorSaveNotice.value}
              </span>
            ) : null}
            <button
              type="button"
              class="btn btn-primary whitespace-nowrap"
              onClick={context.saveVectorSection}
            >
              保存
            </button>
          </div>
        </div>
        <div class="space-y-4">
          <AiVectorSearchSection
            providers={context.providers.value}
            value={context.vectorSettings.value}
            isTesting={context.isVectorTesting.value}
            targetSummary={context.vectorTargetSummary.value}
            description="当前页会保存向量检索目标与阈值，并可验证所选模型是否可连接。"
            onTestConnection={context.runVectorConnectionTest}
            onChange={(next) => {
              context.vectorSettings.value = next;
              context.vectorStatusMessage.value = "";
              context.vectorReindexHint.value = "";
            }}
          />
          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              class="btn btn-small whitespace-nowrap"
              disabled={
                context.isRebuildingVector.value ||
                !context.canRebuildVectorIndex.value
              }
              onClick={context.rebuildVectorIndex}
            >
              {context.isRebuildingVector.value ? "重建中…" : "重建索引"}
            </button>
            {context.isVectorDirty.value ? (
              <span class="text-xs text-amber-600">未保存</span>
            ) : null}
          </div>
          <div class="text-xs">
            {context.vectorStatusMessage.value ? (
              <span class="text-slate-500">
                {context.vectorStatusMessage.value}
              </span>
            ) : null}
            {context.vectorReindexHint.value ? (
              <span class="text-amber-600">
                {context.vectorStatusMessage.value ? " · " : ""}
                {context.vectorReindexHint.value}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    );
  },
});
