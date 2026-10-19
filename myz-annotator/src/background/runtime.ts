/**
 * Chrome implementations of the `@myz/core` runtime ports (`Scheduler`,
 * `Notifier`). Domain code schedules work and emits notifications through these
 * ports; a desktop/mobile host swaps them for timers/system notifications.
 */
import type { Notifier, Scheduler } from "@myz/core/ports";

export const scheduler: Scheduler = {
  async every(name, periodInMinutes, delayInMinutes = periodInMinutes) {
    await chrome.alarms.create(name, { delayInMinutes, periodInMinutes });
  },
  async once(name, delayInMinutes) {
    await chrome.alarms.create(name, { delayInMinutes });
  },
  async cancel(name) {
    await chrome.alarms.clear(name);
  },
  async has(name) {
    return Boolean(await chrome.alarms.get(name));
  },
  onTick(listener) {
    const handler = (alarm: chrome.alarms.Alarm) => listener(alarm.name);
    chrome.alarms.onAlarm.addListener(handler);
    return () => chrome.alarms.onAlarm.removeListener(handler);
  },
};

export const notifier: Notifier = {
  async setBadge(text, background) {
    await chrome.action.setBadgeText({ text });
    if (!text) return;
    if (background) {
      await chrome.action.setBadgeBackgroundColor({ color: [...background] });
    }
    if (typeof chrome.action.setBadgeTextColor === "function") {
      await chrome.action.setBadgeTextColor({ color: [255, 255, 255, 255] });
    }
  },
  async notify({ id, title, message, iconUrl }) {
    await chrome.notifications.create(id ?? `myz-${Date.now()}`, {
      type: "basic",
      iconUrl: iconUrl ?? "assets/icon-128.png",
      title,
      message,
    });
  },
};
