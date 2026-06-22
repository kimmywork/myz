import type { Browser, BrowserContext, Page } from "playwright-core"

export interface BrowserManagerOptions {
  headless?: boolean
  timeoutMs?: number
  viewport?: { width: number; height: number }
}

export interface BrowserSession {
  browser: Browser
  context: BrowserContext
  page: Page
  createdAt: string
  lastUsedAt: string
}

export interface SecurityCheckResult {
  ok: boolean
  reason?: string
}
