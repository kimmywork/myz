import type { MyzRuntimeMap } from "@/messaging/contract.js";
import { createRuntimeTransport } from "@/messaging/transport.js";

/**
 * The background channel's transport (runtime direction). Bound at module load
 * so every `registerMessageHandler` call in `background/messages/*` shares one
 * registry.
 */
const transport = createRuntimeTransport<MyzRuntimeMap>();

export const registerMessageHandler = transport.handle;
export const handleMessage = transport.run;
export const hasHandler = transport.has;
