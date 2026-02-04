import { readSettings } from "../storage";
import { syncNow } from "./syncEngine";

const ALARM_NAME = "myz-sync";
const MIN_DELAY_MINUTES = 3;
const MAX_DELAY_MINUTES = 5;

export function initializeSyncScheduler() {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== ALARM_NAME) return;
    try {
      await syncNow();
    } catch (error) {
      console.warn("Sync alarm failed", error);
    } finally {
      await ensureSyncAlarm();
    }
  });

  const runtimeAny = chrome.runtime as any;
  runtimeAny?.onStartup?.addListener(() => {
    void syncNow();
    void ensureSyncAlarm();
  });
  void ensureSyncAlarm();
}

export async function ensureSyncAlarm() {
  const settings = await readSettings();
  if (!settings.sync?.enabled) {
    await chrome.alarms.clear(ALARM_NAME);
    return;
  }
  const delay = getRandomDelayMinutes();
  await chrome.alarms.create(ALARM_NAME, { delayInMinutes: delay });
}

function getRandomDelayMinutes() {
  return MIN_DELAY_MINUTES + Math.random() * (MAX_DELAY_MINUTES - MIN_DELAY_MINUTES);
}
