import { readSettings } from "../storage";
import { syncNow } from "./syncEngine";

const ALARM_NAME = "myz-sync";
// Target a 30-minute sync interval but spread devices with ±10 minutes of
// jitter so they do not all hit S3 at the same time. (Previously min and max
// were both 30, so the "random" delay was a constant.)
const SYNC_INTERVAL_MINUTES = 30;
const SYNC_JITTER_MINUTES = 10;
const MIN_DELAY_MINUTES = SYNC_INTERVAL_MINUTES - SYNC_JITTER_MINUTES;
const MAX_DELAY_MINUTES = SYNC_INTERVAL_MINUTES + SYNC_JITTER_MINUTES;

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

  const runtime = chrome.runtime as typeof chrome.runtime & {
    onStartup?: chrome.events.Event<() => void>;
  };
  runtime.onStartup?.addListener(() => {
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
  // Only create the alarm when it is absent. Re-creating it on every settings
  // write would reset the countdown and could postpone sync indefinitely
  // (BUG1); the alarm re-arms itself from the handler's `finally` once it fires.
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (existing) {
    return;
  }
  const delay = getRandomDelayMinutes();
  await chrome.alarms.create(ALARM_NAME, { delayInMinutes: delay });
}

function getRandomDelayMinutes() {
  return (
    MIN_DELAY_MINUTES + Math.random() * (MAX_DELAY_MINUTES - MIN_DELAY_MINUTES)
  );
}
