import { isRecord } from "@myz/shared/typeUtils";

export function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs && tabs.length ? tabs[0] : null);
    });
  });
}

export function getPageHighlightState(
  tabId: number | null,
): Promise<{ unreachableIds: string[] } | null> {
  if (tabId == null) return Promise.resolve(null);
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tabId,
      { type: "myz:getHighlightState" },
      (response: { ok: boolean; data?: unknown }) => {
        if (chrome.runtime.lastError || !response || !response.ok) {
          resolve(null);
          return;
        }
        const data = isRecord(response.data) ? response.data : null;
        const unreachableIds = Array.isArray(data?.unreachableIds)
          ? data.unreachableIds.filter(
              (value): value is string =>
                typeof value === "string" && value.trim().length > 0,
            )
          : null;
        resolve(unreachableIds ? { unreachableIds } : null);
      },
    );
  });
}
