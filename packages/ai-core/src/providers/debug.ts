import type {
  ProviderRequestDebugRecord,
  ProviderStreamOptions,
} from "./types"

export async function emitProviderRequestDebug(
  options: ProviderStreamOptions | undefined,
  record: ProviderRequestDebugRecord,
) {
  try {
    await options?.debug?.onRequest?.(record)
  } catch {
    // Debug logging must never block or fail the actual LLM request path.
  }
}
