import { readSettings } from "../storage";
import { buildQueue } from "./queue";

const ALARM_NAME = "myz-inbox-reminder";
const DAY_MINUTES = 24 * 60;

export function initializeInboxReminder() {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== ALARM_NAME) return;
    await runInboxReminder();
  });
  void ensureInboxReminderAlarm();
}

export async function ensureInboxReminderAlarm(): Promise<void> {
  const settings = await readSettings();
  if (
    settings.inboxEnabled === false ||
    settings.inboxReminderEnabled === false
  ) {
    await chrome.alarms.clear(ALARM_NAME);
    return;
  }
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (!existing) {
    await chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: 60,
      periodInMinutes: DAY_MINUTES,
    });
  }
}

async function runInboxReminder(): Promise<void> {
  try {
    const queue = await buildQueue();
    if (queue.counts.pending === 0) return;
    await chrome.notifications.create(`myz-inbox-${Date.now()}`, {
      type: "basic",
      iconUrl: "assets/icon-128.png",
      title: "Inbox 有待处理内容",
      message: `还有 ${queue.counts.pending} 条待处理，去清空收集箱吧`,
    });
  } catch (error) {
    console.warn("Inbox reminder failed", error);
  }
}
