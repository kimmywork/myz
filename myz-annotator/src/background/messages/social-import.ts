import {
  clearTweetImports,
  importSocialRecords,
  SocialImportRequest,
  type SocialImportResult,
} from "../social-import";
import { registerMessageHandler } from "./handler";

export type ImportSocialRecordsMessageResult = SocialImportResult;
export interface ClearTweetImportsMessageResult {
  removed: number;
}

/**
 * Background social import message handlers.
 */
export function initializeSocialImportMessageHandlers() {
  registerMessageHandler(
    "myz:importSocialRecords",
    async (payload: SocialImportRequest) => {
      return await importSocialRecords(payload);
    },
  );

  registerMessageHandler("myz:clearTweetImports", async () => {
    return await clearTweetImports();
  });
}
