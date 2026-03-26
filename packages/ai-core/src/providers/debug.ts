import type {
  ProviderRequestDebugRecord,
  ProviderStreamOptions,
} from "./types"

export async function emitProviderRequestDebug(
  options: ProviderStreamOptions | undefined,
  record: ProviderRequestDebugRecord,
) {
  await options?.debug?.onRequest?.(record)
}
