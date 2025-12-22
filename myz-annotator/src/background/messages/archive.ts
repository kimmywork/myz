import { registerMessageHandler } from "./handler";

import { getArchiveStatusForUrl, ensureArchiveSnapshot, getArchiveHistory } from "../internetArchive";

export function initializeArchiveMessageHandlers() {
  registerMessageHandler(
    "myz:getArchiveStatusForUrl",
    async (payload: { url?: string }) => {
      return getArchiveStatusForUrl(payload?.url || "");
    },
  );

  registerMessageHandler(
    "myz:ensureArchiveSnapshot",
    async (payload: { url?: string; force?: boolean }) => {
      return ensureArchiveSnapshot({
        url: payload?.url,
        force: Boolean(payload?.force),
      });
    },
  );

  registerMessageHandler("myz:getArchiveHistory", async () => {
    return getArchiveHistory();
  });
}
