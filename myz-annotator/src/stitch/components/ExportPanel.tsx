import { Copy, Download } from "@lucide/vue";
import { computed, defineComponent, ref, type PropType } from "vue";
import {
  DEFAULT_EXPORT,
  EXPORT_FORMATS,
  copyRendered,
  isLossy,
  resolveExportScale,
  saveRendered,
  type RenderFn,
} from "../core/export";
import { Button, Segmented, Slider } from "./ui";

/**
 * Export controls: format / scale / quality, save and copy. Vue port of
 * stitch-web's `ExportPanel`.
 */
export default defineComponent({
  name: "StitchExportPanel",
  props: {
    getCanvas: { type: Function as PropType<RenderFn>, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    filenameBase: { type: String, required: true },
    disabled: { type: Boolean, default: false },
  },
  setup(props) {
    const settings = ref({ ...DEFAULT_EXPORT });
    const status = ref<string | null>(null);
    const working = ref(false);

    const resolved = computed(() =>
      resolveExportScale(props.width, props.height, settings.value.scale),
    );

    async function run(kind: "save" | "copy") {
      if (props.disabled) return;
      working.value = true;
      status.value = null;
      try {
        const result =
          kind === "save"
            ? await saveRendered(
                props.getCanvas,
                settings.value,
                props.width,
                props.height,
                props.filenameBase,
              )
            : await copyRendered(
                props.getCanvas,
                settings.value,
                props.width,
                props.height,
              );
        const dims = `${result.width}×${result.height}`;
        status.value =
          (kind === "save" ? `已保存 ${dims}` : `已复制到剪贴板 ${dims}`) +
          (result.clamped ? "（已按浏览器上限缩放）" : "");
      } catch (err) {
        status.value = err instanceof Error ? err.message : "导出失败";
      } finally {
        working.value = false;
        setTimeout(() => (status.value = null), 4000);
      }
    }

    return () => (
      <div class="export-panel">
        <div class="export-row">
          <span class="export-label">格式</span>
          <Segmented
            size="sm"
            value={settings.value.format}
            options={EXPORT_FORMATS.map((format) => ({
              value: format.id,
              label: format.label,
            }))}
            onChange={(format: string) => (settings.value.format = format)}
          />
        </div>
        <div class="export-row">
          <span class="export-label">倍率</span>
          <Segmented
            size="sm"
            value={String(settings.value.scale)}
            options={[
              { value: "0.5", label: "0.5×" },
              { value: "1", label: "1×" },
              { value: "2", label: "2×" },
            ]}
            onChange={(scale: string) => (settings.value.scale = Number(scale))}
          />
        </div>
        {isLossy(settings.value.format) ? (
          <Slider
            label="质量"
            min={0.4}
            max={1}
            step={0.02}
            value={settings.value.quality}
            onChange={(quality: number) => (settings.value.quality = quality)}
            format={(value: number) => `${Math.round(value * 100)}%`}
          />
        ) : null}
        <p class="export-dims">
          输出{" "}
          <strong>
            {resolved.value.width}×{resolved.value.height}
          </strong>{" "}
          px
          {resolved.value.clamped ? (
            <em class="export-warn">（已限制）</em>
          ) : null}
        </p>
        <div class="export-actions">
          <Button
            variant="primary"
            block
            disabled={props.disabled || working.value}
            icon={<Download size={16} />}
            onClick={() => run("save")}
          >
            {working.value ? "处理中…" : "保存图片"}
          </Button>
          <Button
            disabled={props.disabled || working.value}
            icon={<Copy size={16} />}
            onClick={() => run("copy")}
          >
            复制
          </Button>
        </div>
        {status.value ? <p class="export-status">{status.value}</p> : null}
      </div>
    );
  },
});
