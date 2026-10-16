import {
  computed,
  defineComponent,
  onBeforeUnmount,
  onMounted,
  ref,
  watchEffect,
  type PropType,
  type Ref,
} from "vue";

const MAX_BACKING_EDGE = 16000;
/** Never blow a tiny image up more than this on "fit" (keeps it honest and crisp). */
const MAX_FIT_UPSCALE = 3;

/**
 * A fixed-height preview viewport. The generated image is *contain*-fitted
 * inside it (so the layout never jumps and the whole result is always visible),
 * with a 适应 / 1:1 toggle for inspecting at native pixel size.
 *
 * Vue port of stitch-web's `PreviewCanvas`. Pointer/double-click are re-emitted
 * so the mode components keep the same handler shape.
 */
export default defineComponent({
  name: "StitchPreviewCanvas",
  props: {
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    draw: {
      type: Function as PropType<
        (ctx: CanvasRenderingContext2D, scale: number) => void
      >,
      required: true,
    },
    canvasRef: {
      type: Object as PropType<Ref<HTMLCanvasElement | null>>,
      default: null,
    },
    canvasStyle: {
      type: Object as PropType<Record<string, string> | null>,
      default: null,
    },
    stageClassName: { type: String, default: "" },
    empty: { type: Boolean, default: false },
    onPointerDown: {
      type: Function as PropType<(event: PointerEvent) => void>,
      default: null,
    },
    onPointerMove: {
      type: Function as PropType<(event: PointerEvent) => void>,
      default: null,
    },
    onPointerUp: {
      type: Function as PropType<(event: PointerEvent) => void>,
      default: null,
    },
    onPointerCancel: {
      type: Function as PropType<(event: PointerEvent) => void>,
      default: null,
    },
    onDoubleClick: {
      type: Function as PropType<() => void>,
      default: null,
    },
  },
  setup(props) {
    const stageRef = ref<HTMLDivElement | null>(null);
    const localCanvas = ref<HTMLCanvasElement | null>(null);
    const canvas = props.canvasRef ?? localCanvas;
    const box = ref({ w: 0, h: 0 });
    const fit = ref(true);

    let observer: ResizeObserver | null = null;

    const measure = () => {
      const el = stageRef.value;
      if (!el) return;
      const cs = getComputedStyle(el);
      const w =
        el.clientWidth -
        parseFloat(cs.paddingLeft) -
        parseFloat(cs.paddingRight);
      const h =
        el.clientHeight -
        parseFloat(cs.paddingTop) -
        parseFloat(cs.paddingBottom);
      box.value = { w: Math.max(1, w), h: Math.max(1, h) };
    };

    onMounted(() => {
      measure();
      const el = stageRef.value;
      if (el) {
        observer = new ResizeObserver(measure);
        observer.observe(el);
      }
    });

    onBeforeUnmount(() => {
      observer?.disconnect();
      observer = null;
    });

    const viewScale = computed(() => {
      if (
        !box.value.w ||
        !box.value.h ||
        props.width <= 0 ||
        props.height <= 0
      ) {
        return 0;
      }
      if (!fit.value) return 1;
      return Math.min(
        box.value.w / props.width,
        box.value.h / props.height,
        MAX_FIT_UPSCALE,
      );
    });

    watchEffect(
      () => {
        const el = canvas.value;
        const scale = viewScale.value;
        if (!el || scale <= 0) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        let backing = scale * dpr;
        const longest = Math.max(props.width, props.height);
        if (longest * backing > MAX_BACKING_EDGE) {
          backing = MAX_BACKING_EDGE / longest;
        }
        const bw = Math.max(1, Math.round(props.width * backing));
        const bh = Math.max(1, Math.round(props.height * backing));
        if (el.width !== bw || el.height !== bh) {
          el.width = bw;
          el.height = bh;
        }
        el.style.width = `${(props.width * scale).toFixed(2)}px`;
        el.style.height = `${(props.height * scale).toFixed(2)}px`;
        const ctx = el.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, bw, bh);
        props.draw(ctx, backing);
      },
      { flush: "post" },
    );

    return () => {
      const scaled = viewScale.value > 0;
      const pct = Math.round(viewScale.value * 100);
      return (
        <div class="preview">
          <div class="preview-bar">
            <span class="preview-dims">
              {props.width}×{props.height} px
              {scaled ? <em class="preview-zoom-pct">{pct}%</em> : null}
            </span>
            <div class="preview-zoom">
              <button
                type="button"
                class={["stage-tool", fit.value ? "is-active" : ""]}
                onClick={() => (fit.value = true)}
              >
                适应
              </button>
              <button
                type="button"
                class={["stage-tool", !fit.value ? "is-active" : ""]}
                onClick={() => (fit.value = false)}
              >
                1:1
              </button>
            </div>
          </div>
          <div class={["stage", props.stageClassName]} ref={stageRef}>
            {props.empty ? (
              <div class="stage-blank">还没有内容</div>
            ) : (
              <div
                class="stage-view"
                style={
                  scaled
                    ? {
                        width: `${props.width * viewScale.value}px`,
                        height: `${props.height * viewScale.value}px`,
                      }
                    : undefined
                }
              >
                <canvas
                  ref={canvas}
                  class="stage-canvas"
                  style={props.canvasStyle ?? undefined}
                  onPointerdown={(event: PointerEvent) =>
                    props.onPointerDown?.(event)
                  }
                  onPointermove={(event: PointerEvent) =>
                    props.onPointerMove?.(event)
                  }
                  onPointerup={(event: PointerEvent) =>
                    props.onPointerUp?.(event)
                  }
                  onPointercancel={(event: PointerEvent) =>
                    props.onPointerCancel?.(event)
                  }
                  onDblclick={() => props.onDoubleClick?.()}
                />
              </div>
            )}
          </div>
        </div>
      );
    };
  },
});
