/**
 * Harness helpers shared by the AI hand-off specs.
 *
 * Extension pages are the only place a test can call `chrome.*` APIs, so the
 * helpers open the built popup in a throwaway tab and drive settings from there.
 */
import type { BrowserContext, Page } from "@playwright/test";

/**
 * Open the built popup in a probe tab. Open it *before* the interaction under
 * test when the assertions look at active-tab state: the probe steals focus
 * while it is being created.
 */
export async function openTabProbe(context: BrowserContext): Promise<Page> {
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker", { timeout: 10_000 }));
  const extensionId = new URL(worker.url()).host;
  const probe = await context.newPage();
  await probe.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
  return probe;
}

export interface AiSettingsPatch {
  enabled?: boolean;
  provider?: string;
  promptTemplate?: string;
}

/**
 * Persist AI settings the way the dashboard does: merge the patch into the
 * stored `ai` object first (`updateSettings` replaces that key wholesale, so a
 * partial patch would reset the other fields to their defaults).
 */
export async function setAiSettings(
  probe: Page,
  patch: AiSettingsPatch,
): Promise<void> {
  await probe.evaluate(async (aiPatch) => {
    const api = chrome as unknown as {
      runtime: {
        sendMessage: (message: unknown) => Promise<{
          ok?: boolean;
          error?: string;
          data?: { ai?: Record<string, unknown> };
        }>;
      };
    };
    const current = await api.runtime.sendMessage({ type: "myz:getSettings" });
    const ai = { ...(current?.data?.ai ?? {}), ...aiPatch };
    const response = await api.runtime.sendMessage({
      type: "myz:updateSettings",
      payload: { ai },
    });
    if (!response?.ok) {
      throw new Error(response?.error ?? "settings update failed");
    }
  }, patch);
}
