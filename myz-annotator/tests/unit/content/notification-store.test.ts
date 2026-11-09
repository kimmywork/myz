import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNotificationStore } from "../../../src/content/stores/notification-store";

/** `notify` defers the first paint to rAF; run it inline under fake timers. */
function flushFrame() {
  vi.stubGlobal("requestAnimationFrame", (callback: (time: number) => void) => {
    callback(0);
    return 1;
  });
}

describe("notification store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    flushFrame();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("普通提示默认 4 秒", () => {
    const store = useNotificationStore();
    store.notify({ message: "已保存" });
    expect(store.notifications).toHaveLength(1);
    expect(store.notifications[0].remaining).toBe(4000);
  });

  it("pause 冻结倒计时，resume 用剩余时间继续", async () => {
    const store = useNotificationStore();
    store.notify({ message: "已删除划线", duration: 1000 });
    const id = store.notifications[0].id;

    await vi.advanceTimersByTimeAsync(400);
    store.pause(id);
    expect(store.notifications[0].remaining).toBe(600);

    await vi.advanceTimersByTimeAsync(5000);
    expect(store.notifications[0].visible).toBe(true);

    store.resume(id);
    await vi.advanceTimersByTimeAsync(599);
    expect(store.notifications[0].visible).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(store.notifications[0].visible).toBe(false);
  });

  it("pause/resume 会联动调用 onPause/onResume", async () => {
    const store = useNotificationStore();
    const onPause = vi.fn();
    const onResume = vi.fn();
    store.notify({ message: "x", duration: 1000, onPause, onResume });
    const id = store.notifications[0].id;

    store.pause(id);
    expect(onPause).toHaveBeenCalledTimes(1);
    store.resume(id);
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it("已淡出后 pause/resume 都是 no-op", async () => {
    const store = useNotificationStore();
    const onPause = vi.fn();
    const onResume = vi.fn();
    store.notify({ message: "x", duration: 100, onPause, onResume });
    const id = store.notifications[0].id;

    await vi.advanceTimersByTimeAsync(150);
    expect(store.notifications[0].visible).toBe(false);

    expect(() => store.pause(id)).not.toThrow();
    expect(() => store.resume(id)).not.toThrow();
    expect(onPause).not.toHaveBeenCalled();
    expect(onResume).not.toHaveBeenCalled();
  });

  it("triggerAction 先移除提示再执行动作", () => {
    const store = useNotificationStore();
    let lengthInsideAction = -1;
    store.notify({
      message: "已删除划线",
      action: {
        label: "撤销",
        onClick: () => {
          lengthInsideAction = store.notifications.length;
        },
      },
    });
    const id = store.notifications[0].id;

    store.triggerAction(id);

    expect(lengthInsideAction).toBe(0);
    expect(store.notifications).toHaveLength(0);
  });

  it("对不存在的提示 triggerAction 是 no-op", () => {
    const store = useNotificationStore();
    expect(() => store.triggerAction("missing")).not.toThrow();
    expect(store.notifications).toHaveLength(0);
  });
});
