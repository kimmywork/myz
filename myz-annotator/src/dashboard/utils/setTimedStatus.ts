import type { Ref } from "vue";

const timers = new Map<Ref<string>, ReturnType<typeof setTimeout>>();

/**
 * 设置一个带超时自动清除的状态消息。
 * 同一 target 重复调用会先清除上一个计时器，避免旧计时覆盖新消息。
 */
export function setTimedStatus(
  target: Ref<string>,
  message: string,
  duration = 3000,
) {
  target.value = message;
  const existing = timers.get(target);
  if (existing) {
    clearTimeout(existing);
  }
  if (duration > 0) {
    const id = setTimeout(() => {
      target.value = "";
      timers.delete(target);
    }, duration);
    timers.set(target, id);
  }
}

/**
 * 清除所有定时状态计时器，并重置对应状态。
 */
export function clearAllTimedStatus() {
  timers.forEach((id) => clearTimeout(id));
  timers.clear();
}
