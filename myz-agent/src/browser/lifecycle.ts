import type { BrowserManagerOptions, BrowserSession } from "./types"

export class BrowserManager {
  private session: BrowserSession | null = null
  private readonly options: Required<BrowserManagerOptions>
  private readonly idleTimeoutMs = 5 * 60 * 1000
  private idleTimer: ReturnType<typeof setTimeout> | null = null

  constructor(options?: BrowserManagerOptions) {
    this.options = {
      headless: options?.headless ?? true,
      timeoutMs: options?.timeoutMs ?? 30_000,
      viewport: options?.viewport ?? { width: 1280, height: 720 },
    }
  }

  async getSession(): Promise<BrowserSession> {
    if (this.session) {
      this.session.lastUsedAt = new Date().toISOString()
      this.resetIdleTimer()
      return this.session
    }

    const { chromium } = await import("playwright-core")
    const browser = await chromium.launch({
      headless: this.options.headless,
    })
    const context = await browser.newContext({
      viewport: this.options.viewport,
    })
    const page = await context.newPage()
    page.setDefaultTimeout(this.options.timeoutMs)

    const now = new Date().toISOString()
    this.session = {
      browser,
      context,
      page,
      createdAt: now,
      lastUsedAt: now,
    }
    this.resetIdleTimer()
    return this.session
  }

  async close(): Promise<void> {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
    if (this.session) {
      try {
        await this.session.browser.close()
      } catch {
        // ignore close errors
      }
      this.session = null
    }
  }

  isActive(): boolean {
    return this.session !== null
  }

  registerShutdownHook(): void {
    const cleanup = () => {
      void this.close()
    }
    process.on("exit", cleanup)
    process.on("SIGINT", () => {
      cleanup()
      process.exit(130)
    })
    process.on("SIGTERM", () => {
      cleanup()
      process.exit(143)
    })
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
    }
    this.idleTimer = setTimeout(() => {
      void this.close()
    }, this.idleTimeoutMs)
    if (this.idleTimer.unref) {
      this.idleTimer.unref()
    }
  }
}
