function sleep(ms: number) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

export interface RetryOptions {
  retries: number
  baseDelayMs?: number
  maxDelayMs?: number
  shouldRetry?: (error: unknown, attempt: number) => boolean
}

export async function withRetry<T>(
  action: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const retries = Math.max(0, Math.floor(options.retries))
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 500)
  const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? 4000)
  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await action(attempt)
    } catch (error) {
      lastError = error
      if (attempt >= retries) {
        throw error
      }
      if (typeof options.shouldRetry === "function" && !options.shouldRetry(error, attempt)) {
        throw error
      }
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt)
      await sleep(delay)
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Retry failed")
}
