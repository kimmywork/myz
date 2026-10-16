import { createMessageRegistry } from "@myz/shared/messageRegistry";
import type { MyzTabMap } from "@/messaging/contract.js";

const { registerMessageHandler, handleMessage, hasHandler } =
  createMessageRegistry<MyzTabMap>();

export { registerMessageHandler, handleMessage, hasHandler };
