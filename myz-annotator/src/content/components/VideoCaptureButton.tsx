import { IconCamera } from "@myz/shared/icons";
import { defineComponent, onBeforeUnmount, onMounted, ref } from "vue";
import { captureVideoFrame } from "../capture-media";

/** Must match the `.myz-video-capture` size in shadow.css. */
const BUTTON_SIZE = 36;
const EDGE_GAP = 8;

/** Fractional top-left position (0..1) of the button inside the video frame. */
interface FramePosition {
  fx: number;
  fy: number;
}

interface Target {
  video: HTMLVideoElement;
  top: number;
  left: number;
}

function isVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width < 40 || rect.height < 40) return false;
  const style = getComputedStyle(element);
  if (style.visibility === "hidden" || style.display === "none") return false;
  return (
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Floating "capture current frame" button. Many players draw their own overlay
 * on top of the `<video>`, which swallows the context menu — so instead of the
 * right-click path we surface a semi-transparent button while the pointer is
 * over a video.
 *
 * The button is draggable anywhere inside the video frame; its position is kept
 * per video element (a session-local fractional position, so it survives resizes
 * and scrolls). No auto-hide timer: it is visible whenever the pointer is over
 * the video, and can simply be dragged away from the player's own controls.
 */
export default defineComponent({
  name: "VideoCaptureButton",
  setup() {
    const target = ref<Target | null>(null);
    const dragging = ref(false);
    const positions = new WeakMap<HTMLVideoElement, FramePosition>();
    let grab = { dx: 0, dy: 0 };
    let frame = 0;
    let lastX = -1;
    let lastY = -1;
    let startX = 0;
    let startY = 0;
    let moved = false;

    function videoAt(x: number, y: number): HTMLVideoElement | null {
      const videos = Array.from(
        document.querySelectorAll("video"),
      ) as HTMLVideoElement[];
      let best: HTMLVideoElement | null = null;
      let bestArea = Infinity;
      for (const video of videos) {
        if (!isVisible(video)) continue;
        const rect = video.getBoundingClientRect();
        if (
          x >= rect.left &&
          x <= rect.right &&
          y >= rect.top &&
          y <= rect.bottom
        ) {
          const area = rect.width * rect.height;
          if (area < bestArea) {
            bestArea = area;
            best = video;
          }
        }
      }
      return best;
    }

    /** Bounds the button can occupy: inside the video, clipped to the viewport. */
    function bounds(rect: DOMRect) {
      const minLeft = Math.max(rect.left, EDGE_GAP);
      const minTop = Math.max(rect.top, EDGE_GAP);
      const maxLeft = Math.max(
        minLeft,
        Math.min(
          rect.right - BUTTON_SIZE,
          window.innerWidth - BUTTON_SIZE - EDGE_GAP,
        ),
      );
      const maxTop = Math.max(
        minTop,
        Math.min(
          rect.bottom - BUTTON_SIZE,
          window.innerHeight - BUTTON_SIZE - EDGE_GAP,
        ),
      );
      return { minLeft, minTop, maxLeft, maxTop };
    }

    function placeFor(video: HTMLVideoElement): Target {
      const rect = video.getBoundingClientRect();
      const { minLeft, minTop, maxLeft, maxTop } = bounds(rect);
      const pos = positions.get(video) ?? { fx: 1, fy: 0 };
      const spanX = Math.max(1, rect.width - BUTTON_SIZE);
      const spanY = Math.max(1, rect.height - BUTTON_SIZE);
      return {
        video,
        left: clamp(rect.left + pos.fx * spanX, minLeft, maxLeft),
        top: clamp(rect.top + pos.fy * spanY, minTop, maxTop),
      };
    }

    function update() {
      frame = 0;
      if (dragging.value) return;
      const video = videoAt(lastX, lastY);
      target.value = video ? placeFor(video) : null;
    }

    function schedule() {
      if (frame) return;
      frame = requestAnimationFrame(update);
    }

    function onMove(event: MouseEvent) {
      lastX = event.clientX;
      lastY = event.clientY;
      schedule();
    }

    function onScrollOrResize() {
      schedule();
    }

    function onDocumentLeave() {
      if (!dragging.value) target.value = null;
    }

    onMounted(() => {
      window.addEventListener("mousemove", onMove, { passive: true });
      window.addEventListener("scroll", onScrollOrResize, {
        passive: true,
        capture: true,
      });
      window.addEventListener("resize", onScrollOrResize, { passive: true });
      document.addEventListener("mouseleave", onDocumentLeave);
    });

    onBeforeUnmount(() => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      document.removeEventListener("mouseleave", onDocumentLeave);
      if (frame) cancelAnimationFrame(frame);
    });

    function onPointerDown(event: PointerEvent) {
      event.preventDefault();
      event.stopPropagation();
      const current = target.value;
      if (!current) return;
      dragging.value = true;
      moved = false;
      startX = event.clientX;
      startY = event.clientY;
      grab = {
        dx: event.clientX - current.left,
        dy: event.clientY - current.top,
      };
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }

    function onPointerMove(event: PointerEvent) {
      if (!dragging.value) return;
      const current = target.value;
      if (!current) return;
      if (
        !moved &&
        Math.hypot(event.clientX - startX, event.clientY - startY) > 4
      ) {
        moved = true;
      }
      const rect = current.video.getBoundingClientRect();
      const { minLeft, minTop, maxLeft, maxTop } = bounds(rect);
      const left = clamp(event.clientX - grab.dx, minLeft, maxLeft);
      const top = clamp(event.clientY - grab.dy, minTop, maxTop);
      target.value = { video: current.video, top, left };
      const spanX = Math.max(1, rect.width - BUTTON_SIZE);
      const spanY = Math.max(1, rect.height - BUTTON_SIZE);
      positions.set(current.video, {
        fx: (left - rect.left) / spanX,
        fy: (top - rect.top) / spanY,
      });
    }

    function onPointerUp(event: PointerEvent) {
      if (!dragging.value) return;
      dragging.value = false;
      try {
        (event.currentTarget as HTMLElement).releasePointerCapture(
          event.pointerId,
        );
      } catch {
        // Capture may already be released; ignore.
      }
    }

    async function onClick(event: MouseEvent) {
      event.preventDefault();
      event.stopPropagation();
      if (moved) {
        moved = false;
        return;
      }
      const video = target.value?.video;
      if (!video) return;
      await captureVideoFrame(video.currentSrc || video.src || undefined);
    }

    return () => {
      const current = target.value;
      if (!current) return null;
      return (
        <button
          type="button"
          class={["myz-video-capture", dragging.value ? "is-dragging" : ""]}
          title="截取当前视频帧（可拖动）"
          aria-label="截取当前视频帧"
          style={{ top: `${current.top}px`, left: `${current.left}px` }}
          onMousedown={(event: MouseEvent) => event.stopPropagation()}
          onPointerdown={onPointerDown}
          onPointermove={onPointerMove}
          onPointerup={onPointerUp}
          onPointercancel={onPointerUp}
          onClick={onClick}
        >
          <IconCamera size={18} aria-hidden="true" />
        </button>
      );
    };
  },
});
