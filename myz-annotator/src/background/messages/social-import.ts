import { registerMessageHandler } from "./handler";
import {
  clearTweetImports,
  importSocialRecords,
  SocialImportRequest,
} from "../social-import";

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
