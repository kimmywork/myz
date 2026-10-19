import { notifier, scheduler } from "../runtime";
import { readSettings } from "../storage";
import { buildQueue } from "./queue";

const ALARM_NAME = "myz-inbox-reminder";
const DAY_MINUTES = 24 * 60;

export function initializeInboxReminder() {
  scheduler.onTick(async (name) => {
    if (name !== ALARM_NAME) return;
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
    await scheduler.cancel(ALARM_NAME);
    return;
  }
  if (await scheduler.has(ALARM_NAME)) {
    return;
  }
  await scheduler.every(ALARM_NAME, DAY_MINUTES, 60);
}

async function runInboxReminder(): Promise<void> {
  try {
    const queue = await buildQueue();
    if (queue.counts.pending === 0) return;
    await notifier.notify({
      title: "Inbox 有待处理内容",
      message: `还有 ${queue.counts.pending} 条待处理，去清空收集箱吧`,
    });
  } catch (error) {
    console.warn("Inbox reminder failed", error);
  }
}
