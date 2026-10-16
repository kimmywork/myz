import { createMessageRegistry } from "@myz/shared/messageRegistry";
import type { MyzRuntimeMap } from "@/messaging/contract.js";

const { registerMessageHandler, handleMessage, hasHandler } =
  createMessageRegistry<MyzRuntimeMap>();

export { registerMessageHandler, handleMessage, hasHandler };
