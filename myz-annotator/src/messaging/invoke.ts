/**
 * Typed runtime-message invocation.
 *
 * `@myz/shared/messaging`'s `sendMessage` is untyped at the wire boundary
 * (call sites repeat `<Payload, Result>` by hand). `invoke` derives both from
 * the contract map, so a typo or payload/result drift fails at compile time.
 */
import { sendMessage } from "@myz/shared/messaging";
import type { MyzRuntimeMap } from "./contract.js";

type PayloadArgs<K extends keyof MyzRuntimeMap> =
  MyzRuntimeMap[K]["payload"] extends undefined | void
    ? [payload?: MyzRuntimeMap[K]["payload"]]
    : [payload: MyzRuntimeMap[K]["payload"]];

export function invoke<K extends keyof MyzRuntimeMap>(
  type: K,
  ...args: PayloadArgs<K>
): Promise<MyzRuntimeMap[K]["result"]> {
  const [payload] = args;
  return sendMessage<MyzRuntimeMap[K]["payload"], MyzRuntimeMap[K]["result"]>(
    type as string,
    payload,
  );
}
