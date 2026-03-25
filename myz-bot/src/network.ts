import {
  Agent,
  ProxyAgent,
  setGlobalDispatcher,
  type Dispatcher,
} from "undici"

export interface BotNetworkConfig {
  requestTimeoutMs: number
  connectTimeoutMs: number
  keepAliveTimeoutMs: number
  keepAliveTimeoutThresholdMs: number
  proxyUrl: string
}

const DEFAULT_NETWORK_CONFIG: BotNetworkConfig = {
  requestTimeoutMs: 180_000,
  connectTimeoutMs: 10_000,
  keepAliveTimeoutMs: 4_000,
  keepAliveTimeoutThresholdMs: 2_000,
  proxyUrl: "",
}

interface GlobalNetworkState {
  baseFetch: typeof fetch | null
  dispatcher: Dispatcher | null
  config: BotNetworkConfig
  installed: boolean
}

const globalNetworkState: GlobalNetworkState = {
  baseFetch: null,
  dispatcher: null,
  config: DEFAULT_NETWORK_CONFIG,
  installed: false,
}

function normalizeMs(value: number, fallback: number, allowZero = false) {
  if (!Number.isFinite(value)) return fallback
  const normalized = Math.floor(value)
  if (allowZero && normalized === 0) return 0
  return normalized > 0 ? normalized : fallback
}

function getAbortReason(signal: AbortSignal | undefined) {
  if (!signal) return undefined
  return (signal as AbortSignal & { reason?: unknown }).reason
}

function createTimedSignal(signal: AbortSignal | null | undefined, timeoutMs: number) {
  if (!(timeoutMs > 0)) {
    return {
      signal: signal ?? undefined,
      cleanup: () => undefined,
      didTimeout: () => false,
    }
  }

  const controller = new AbortController()
  let timedOut = false
  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort(new Error(`Request timeout after ${timeoutMs}ms`))
  }, timeoutMs)

  const handleAbort = () => {
    controller.abort(getAbortReason(signal || undefined))
  }

  if (signal) {
    if (signal.aborted) {
      handleAbort()
    } else {
      signal.addEventListener("abort", handleAbort, { once: true })
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId)
      signal?.removeEventListener("abort", handleAbort)
    },
    didTimeout: () => timedOut,
  }
}

function buildDispatcherOptions(config: BotNetworkConfig) {
  return {
    connectTimeout: normalizeMs(config.connectTimeoutMs, DEFAULT_NETWORK_CONFIG.connectTimeoutMs),
    keepAliveTimeout: normalizeMs(
      config.keepAliveTimeoutMs,
      DEFAULT_NETWORK_CONFIG.keepAliveTimeoutMs,
    ),
    keepAliveTimeoutThreshold: normalizeMs(
      config.keepAliveTimeoutThresholdMs,
      DEFAULT_NETWORK_CONFIG.keepAliveTimeoutThresholdMs,
      true,
    ),
  }
}

function createDispatcher(config: BotNetworkConfig): Dispatcher {
  const dispatcherOptions = buildDispatcherOptions(config)
  const proxyUrl = config.proxyUrl.trim()
  if (proxyUrl) {
    return new ProxyAgent({
      uri: proxyUrl,
      ...dispatcherOptions,
    })
  }
  return new Agent(dispatcherOptions)
}

function swapGlobalDispatcher(config: BotNetworkConfig) {
  const next = createDispatcher(config)
  const previous = globalNetworkState.dispatcher
  globalNetworkState.dispatcher = next
  setGlobalDispatcher(next)
  if (previous && previous !== next) {
    void previous.destroy().catch(() => undefined)
  }
}

export function shouldResetNetworkDispatcher(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /fetch failed|timeout|aborted|UND_ERR|ECONNRESET|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|ETIMEDOUT|socket|terminated|other side closed/i.test(
    message,
  )
}

export function createFetchWithTimeout(
  baseFetch: typeof fetch,
  options: {
    getRequestTimeoutMs: () => number
    onNetworkError?: (error: unknown) => void
  },
): typeof fetch {
  return async (input, init) => {
    const timeoutMs = normalizeMs(
      options.getRequestTimeoutMs(),
      DEFAULT_NETWORK_CONFIG.requestTimeoutMs,
      true,
    )
    const timedSignal = createTimedSignal(init?.signal, timeoutMs)
    const nextInit =
      timedSignal.signal && timedSignal.signal !== init?.signal
        ? { ...(init || {}), signal: timedSignal.signal }
        : init
    try {
      return await baseFetch(input, nextInit)
    } catch (error) {
      if (timedSignal.didTimeout() || shouldResetNetworkDispatcher(error)) {
        options.onNetworkError?.(error)
      }
      throw error
    } finally {
      timedSignal.cleanup()
    }
  }
}

export function configureGlobalNetwork(
  config: Partial<BotNetworkConfig> | null | undefined,
) {
  globalNetworkState.config = {
    ...DEFAULT_NETWORK_CONFIG,
    ...(config || {}),
    requestTimeoutMs: normalizeMs(
      config?.requestTimeoutMs ?? DEFAULT_NETWORK_CONFIG.requestTimeoutMs,
      DEFAULT_NETWORK_CONFIG.requestTimeoutMs,
      true,
    ),
    connectTimeoutMs: normalizeMs(
      config?.connectTimeoutMs ?? DEFAULT_NETWORK_CONFIG.connectTimeoutMs,
      DEFAULT_NETWORK_CONFIG.connectTimeoutMs,
    ),
    keepAliveTimeoutMs: normalizeMs(
      config?.keepAliveTimeoutMs ?? DEFAULT_NETWORK_CONFIG.keepAliveTimeoutMs,
      DEFAULT_NETWORK_CONFIG.keepAliveTimeoutMs,
    ),
    keepAliveTimeoutThresholdMs: normalizeMs(
      config?.keepAliveTimeoutThresholdMs ??
        DEFAULT_NETWORK_CONFIG.keepAliveTimeoutThresholdMs,
      DEFAULT_NETWORK_CONFIG.keepAliveTimeoutThresholdMs,
      true,
    ),
    proxyUrl: typeof config?.proxyUrl === "string" ? config.proxyUrl.trim() : "",
  }

  swapGlobalDispatcher(globalNetworkState.config)

  if (!globalNetworkState.installed) {
    globalNetworkState.baseFetch = globalThis.fetch.bind(globalThis)
    const wrappedFetch = createFetchWithTimeout(globalNetworkState.baseFetch, {
      getRequestTimeoutMs: () => globalNetworkState.config.requestTimeoutMs,
      onNetworkError: () => {
        swapGlobalDispatcher(globalNetworkState.config)
      },
    })
    ;(globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = wrappedFetch
    globalNetworkState.installed = true
  }
}
