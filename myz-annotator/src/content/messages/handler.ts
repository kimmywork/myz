import { createMessageRegistry } from "@myz/shared/messageRegistry";

const { registerMessageHandler, handleMessage, hasHandler } =
  createMessageRegistry();

export { registerMessageHandler, handleMessage, hasHandler };
