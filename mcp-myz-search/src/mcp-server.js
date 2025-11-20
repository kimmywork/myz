import express from 'express'
import { chromium } from 'playwright'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { Command, Option } from 'commander'
import fs from 'fs'
import path from 'path'

// CLI arg parser using commander
function parseArgs(argv) {
  const program = new Command()
  program
    .storeOptionsAsProperties(false)
    .passThroughOptions(false)
    .addOption(new Option('--default-provider <provider>', 'default search provider').default('bing').choices(['bing', 'duckduckgo', 'google']))
    .option('--port <number>', 'port number', v => Number(v))
    .option('--proxy <proxy>', 'proxy server')
    .option('--timeout <ms>', 'navigation timeout in ms', v => Number(v))
    .option('--headed', 'headed mode')
    .option('--channel <name>', 'browser channel', 'chrome')
    .option('--profile <dir>', 'persistent user data directory')
    .option('--human-wait <ms>', 'wait ms for human to solve challenge', v => Number(v))
    .option('--stdio', 'use stdio transport instead of HTTP')
    .option('--log-file <path>', 'log file path (default: stderr)')

  program.parse(argv, { from: 'user' })
  const opts = program.opts()
  return {
    port: opts.port,
    proxy: opts.proxy,
    timeout: opts.timeout,
    headed: opts.headed,
    channel: opts.channel,
    profile: opts.profile,
    humanWait: opts.humanWait,
    stdio: opts.stdio,
    logFile: opts.logFile,
    defaultProvider: opts.defaultProvider,
  }
}

const ARGS = parseArgs(process.argv.slice(2))
const ENV = process.env

const PORT = (ARGS.port ?? (ENV.MYZ_SEARCH_PORT ? Number(ENV.MYZ_SEARCH_PORT) : (ENV.PORT ? Number(ENV.PORT) : 3000)))
const PROXY = (ARGS.proxy ?? ENV.MYZ_SEARCH_PROXY) || undefined
const TIMEOUT_MS = (ARGS.timeout ?? (ENV.MYZ_SEARCH_TIMEOUT ? Number(ENV.MYZ_SEARCH_TIMEOUT) : undefined)) ?? 30000
const HEADLESS = !ARGS.headed
const CHANNEL = ARGS.channel ?? (ENV.CHANNEL || 'chrome')
const PROFILE_DIR = ARGS.profile ?? ENV.MYZ_SEARCH_PROFILE_DIR
const HUMAN_WAIT_MS = ARGS.humanWait ?? (ENV.MYZ_SEARCH_HUMAN_WAIT ? Number(ENV.MYZ_SEARCH_HUMAN_WAIT) : 0)
const USE_STDIO = ARGS.stdio ?? (ENV.MYZ_SEARCH_STDIO === 'true')
const LOG_FILE = ARGS.logFile ?? ENV.MYZ_SEARCH_LOG_FILE
const BING_API_KEY = ENV.MYZ_SEARCH_BING_API_KEY || ENV.BING_API_KEY
const DEFAULT_PROVIDER = ARGS.defaultProvider || 'bing'

// Log appender system
class LogAppender {
  constructor(logFile) {
    this.logFile = logFile
    this.stream = null

    if (logFile) {
      // Ensure directory exists
      const logDir = path.dirname(logFile)
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true })
      }
      this.stream = fs.createWriteStream(logFile, { flags: 'a', encoding: 'utf8' })
    }
  }

  log(level, ...args) {
    const timestamp = new Date().toISOString()
    const message = args.map(arg =>
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ')

    const formatted = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`

    if (this.stream) {
      // Write to file
      this.stream.write(formatted)
    } else {
      // Write to stderr
      process.stderr.write(formatted)
    }
  }

  info(...args) {
    this.log('info', ...args)
  }

  warn(...args) {
    this.log('warn', ...args)
  }

  error(...args) {
    this.log('error', ...args)
  }

  close() {
    if (this.stream) {
      this.stream.end()
    }
  }
}

// Create global logger instance
const logger = new LogAppender(LOG_FILE)

function resolveLaunchOptions() {
  const opts = { headless: HEADLESS }
  if (CHANNEL) opts.channel = CHANNEL
  if (PROXY) opts.proxy = { server: PROXY }
  return opts
}

// Browser manager: keep one browser/context/page and serialize access
let BROWSER = null
let CONTEXT = null
let PAGE = null
let _busy = false
const _queue = []

// Separate browser instance for Bing without proxy
let BING_BROWSER = null
let BING_CONTEXT = null
let BING_PAGE = null
let _bing_busy = false
const _bing_queue = []

async function initBrowser() {
  if (BROWSER || CONTEXT) return
  if (PROFILE_DIR) {
    CONTEXT = await chromium.launchPersistentContext(PROFILE_DIR, resolveLaunchOptions())
  } else {
    BROWSER = await chromium.launch(resolveLaunchOptions())
    CONTEXT = await BROWSER.newContext()
  }
  PAGE = await CONTEXT.newPage()
  PAGE.setDefaultNavigationTimeout(TIMEOUT_MS)
  PAGE.setDefaultTimeout(TIMEOUT_MS)
  PAGE.on?.('close', async () => {
    // Recreate page if closed unexpectedly
    try {
      PAGE = await CONTEXT.newPage()
      PAGE.setDefaultNavigationTimeout(TIMEOUT_MS)
      PAGE.setDefaultTimeout(TIMEOUT_MS)
    } catch {}
  })
}

async function initBingBrowser() {
  if (BING_BROWSER || BING_CONTEXT) return

  // Create launch options without proxy for Bing
  const bingLaunchOptions = { headless: HEADLESS }
  if (CHANNEL) bingLaunchOptions.channel = CHANNEL
  // Note: No proxy for Bing browser

  if (PROFILE_DIR) {
    // For persistent context, we need a different directory for Bing
    const bingProfileDir = PROFILE_DIR + '-bing'
    BING_CONTEXT = await chromium.launchPersistentContext(bingProfileDir, bingLaunchOptions)
  } else {
    BING_BROWSER = await chromium.launch(bingLaunchOptions)
    BING_CONTEXT = await BING_BROWSER.newContext()
  }
  BING_PAGE = await BING_CONTEXT.newPage()
  BING_PAGE.setDefaultNavigationTimeout(TIMEOUT_MS)
  BING_PAGE.setDefaultTimeout(TIMEOUT_MS)
  BING_PAGE.on?.('close', async () => {
    // Recreate page if closed unexpectedly
    try {
      BING_PAGE = await BING_CONTEXT.newPage()
      BING_PAGE.setDefaultNavigationTimeout(TIMEOUT_MS)
      BING_PAGE.setDefaultTimeout(TIMEOUT_MS)
    } catch {}
  })
}

function acquireLock() {
  if (!_busy) {
    _busy = true
    const release = () => {
      _busy = false
      const next = _queue.shift()
      if (next) next()
    }
    return Promise.resolve(release)
  }
  return new Promise((resolve) => {
    _queue.push(() => {
      _busy = true
      const release = () => {
        _busy = false
        const next = _queue.shift()
        if (next) next()
      }
      resolve(release)
    })
  })
}

function acquireBingLock() {
  if (!_bing_busy) {
    _bing_busy = true
    const release = () => {
      _bing_busy = false
      const next = _bing_queue.shift()
      if (next) next()
    }
    return Promise.resolve(release)
  }
  return new Promise((resolve) => {
    _bing_queue.push(() => {
      _bing_busy = true
      const release = () => {
        _bing_busy = false
        const next = _bing_queue.shift()
        if (next) next()
      }
      resolve(release)
    })
  })
}

async function withPage(fn) {
  await initBrowser()
  const release = await acquireLock()
  try {
    if (!PAGE || PAGE.isClosed()) {
      PAGE = await CONTEXT.newPage()
      PAGE.setDefaultNavigationTimeout(TIMEOUT_MS)
      PAGE.setDefaultTimeout(TIMEOUT_MS)
    }
    return await fn(PAGE)
  } finally {
    release()
  }
}

async function withBingPage(fn) {
  await initBingBrowser()
  const release = await acquireBingLock()
  try {
    if (!BING_PAGE || BING_PAGE.isClosed()) {
      BING_PAGE = await BING_CONTEXT.newPage()
      BING_PAGE.setDefaultNavigationTimeout(TIMEOUT_MS)
      BING_PAGE.setDefaultTimeout(TIMEOUT_MS)
    }
    return await fn(BING_PAGE)
  } finally {
    release()
  }
}

export async function shutdownBrowser() {
  try { await PAGE?.close() } catch {}
  try { await CONTEXT?.close() } catch {}
  try { await BROWSER?.close() } catch {}
  PAGE = null; CONTEXT = null; BROWSER = null

  try { await BING_PAGE?.close() } catch {}
  try { await BING_CONTEXT?.close() } catch {}
  try { await BING_BROWSER?.close() } catch {}
  BING_PAGE = null; BING_CONTEXT = null; BING_BROWSER = null

  // Close logger
  logger.close()
}


async function bingSearch(page, keyword) {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(keyword)}`

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS })
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000) // 额外等待时间
  } catch (error) {
    // 如果导航失败，可能是代理问题，尝试重新加载
    logger.warn('Bing navigation failed, retrying:', error.message)
    try {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS })
      await page.waitForLoadState('networkidle')
    } catch (retryError) {
      logger.error('Bing retry failed:', retryError.message)
      return []
    }
  }

  const results = []
  let items = await page.$$('[data-testid="result"]')

  if (items.length === 0) {
    // Detect potential challenge and optionally wait for human to solve
    const challenged = await detectChallenge(page)
    if (challenged && HUMAN_WAIT_MS > 0 && !HEADLESS) {
      try {
        await page.waitForFunction(() => document.querySelector('[data-testid="result"], .b_algo, .b_title h2 a'), { timeout: HUMAN_WAIT_MS })
        items = await page.$$('[data-testid="result"]')
      } catch {}
    }

    // 尝试更多可能的搜索结果元素
    const legacyItems = items.length ? [] : await page.$$('.b_algo, .b_title, li.b_algo, .b_caption')
    for (const item of legacyItems) {
      try {
        const a = await item.$('h2 a, h3 a, .b_title h2 a, .b_algo h2 a')
        const link = a ? await a.getAttribute('href') : null
        const title = a ? (await a.innerText()).trim() : null

        // 改进 legacy items 的摘要提取
        let desc = ''
        const descSelectors = [
          '.b_caption p',
          '.b_snippet',
          '.b_attribution',
          'p',
          '.b_caption',
          '.b_algo .b_caption',
          '.b_algo p',
          '.rwrl',
        ]

        for (const selector of descSelectors) {
          const descEl = await item.$(selector)
          if (descEl) {
            const text = (await descEl.innerText()).trim()
            if (text && text.length > 0 && text.length > desc.length) {
              desc = text
            }
          }
        }

        // 如果仍然没有找到摘要，尝试从整个结果项提取
        if (!desc) {
          const fullText = (await item.innerText()).trim()
          if (title && fullText.includes(title)) {
            const textAfterTitle = fullText.substring(fullText.indexOf(title) + title.length).trim()
            // 取前150个字符作为摘要
            desc = textAfterTitle.substring(0, 150).trim()
          }
        }

        if (link && title) results.push({ link, title, snippet: desc })
      } catch (itemError) {
        logger.warn('Bing legacy item processing error:', itemError.message)
      }
    }
    return results
  }

  for (const item of items) {
    try {
      const a = await item.$('a')
      const link = a ? await a.getAttribute('href') : null
      // Improved title selectors for Bing search results
      const titleEl = await item.$('h2 a, h3 a, .b_algo h2 a, .b_title h2 a, [data-testid="result-title"] a')
      const title = titleEl ? (await titleEl.innerText()).trim() : null

      // 改进摘要选择器 - 尝试多个可能的摘要元素
      let desc = ''
      const descSelectors = [
        '.b_caption p',
        '.b_snippet',
        '.b_attribution',
        'p',
        '.b_caption',
        '.b_algo .b_caption',
        '.b_algo p',
        '[data-testid="result-snippet"]',
        '.b_lineclamp2',
        '.b_lineclamp3',
        '.b_lineclamp4'
      ]

      for (const selector of descSelectors) {
        const descEl = await item.$(selector)
        if (descEl) {
          const text = (await descEl.innerText()).trim()
          if (text && text.length > 0) {
            desc = text
            break
          }
        }
      }

      // 如果仍然没有找到摘要，尝试从整个结果项提取
      if (!desc) {
        const fullText = (await item.innerText()).trim()
        if (title && fullText.includes(title)) {
          const textAfterTitle = fullText.substring(fullText.indexOf(title) + title.length).trim()
          // 取前150个字符作为摘要
          desc = textAfterTitle.substring(0, 150).trim()
        }
      }

      if (link && title) results.push({ link, title, snippet: desc })
    } catch (itemError) {
      logger.warn('Bing item processing error:', itemError.message)
    }
  }
  return results
}

async function detectChallenge(page) {
  try {
    const bodyText = (await page.textContent('body'))?.toLowerCase() || ''
    if (bodyText.includes('verify') || bodyText.includes('robot') || bodyText.includes('captcha')) return true
    const hasCaptcha = await page.$('iframe[src*="hcaptcha"], iframe[src*="recaptcha"], #b_captcha')
    return !!hasCaptcha
  } catch {
    return false
  }
}

async function searchViaApi(q, limit) {
  const count = Math.min(Math.max(limit || 10, 1), 50)
  const url = new URL('https://api.bing.microsoft.com/v7.0/search')
  url.searchParams.set('q', q)
  url.searchParams.set('count', String(count))
  const resp = await fetch(url, {
    headers: { 'Ocp-Apim-Subscription-Key': BING_API_KEY }
  })
  if (!resp.ok) throw new Error(`Bing API error: ${resp.status}`)
  const data = await resp.json()
  const list = (data.webPages?.value || []).slice(0, count).map((it) => ({
    link: it.url,
    title: it.name,
    snippet: it.snippet || ''
  }))
  return list
}

async function nextPageBing(page) {
  const next = await page.$('a[title="Next page"], a.sb_pagN, a[aria-label="Next page"], a[aria-label="下一页"]')
  if (!next) return false
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS }),
    next.click()
  ])
  await page.waitForLoadState('networkidle')
  return true
}

// DuckDuckGo provider
async function ddgNavigate(page, keyword) {
  const url = `https://duckduckgo.com/?q=${encodeURIComponent(keyword)}&t=h_&ia=web`
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS })
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1000) // 额外等待时间
}
async function ddgCollect(page) {
  const results = []
  const seenLinks = new Set() // 用于去重

  // 使用更精确的选择器避免重复
  const items = await page.$$('[data-testid="result"]:not([data-layout="news"]), #links .result:not(.result--ad), .react-results--main [data-layout="organic"] .result')

  for (const item of items) {
    try {
      const a = await item.$('a[data-testid="result-title-a"], h2 a, a.result__a, a[data-testid="result-extras-url"]')
      let link = a ? await a.getAttribute('href') : null
      const title = a ? (await a.innerText()).trim() : null

      // 改进摘要选择器 - 使用更精确的选择器
      let desc = ''

      // 尝试主要摘要选择器
      const descEl = await item.$('[data-testid="result-snippet"], .result__snippet, .js-result-extras')
      if (descEl) {
        desc = (await descEl.innerText()).trim()
      }

      // 如果主要摘要为空，尝试其他选择器
      if (!desc) {
        const snippetEl = await item.$('.result__snippet__highlight, .result__body__snippet, .result__body__detail')
        desc = snippetEl ? (await snippetEl.innerText()).trim() : ''
      }

      // 如果仍然没有摘要，尝试从整个结果项提取文本
      if (!desc) {
        const fullText = (await item.innerText()).trim()
        // 从完整文本中提取摘要（排除标题）
        if (title && fullText.includes(title)) {
          const textAfterTitle = fullText.substring(fullText.indexOf(title) + title.length).trim()
          // 取前150个字符作为摘要
          desc = textAfterTitle.substring(0, 150).trim()
        }
      }

      if (link && title) {
        if (link.startsWith('/l/?')) {
          try {
            const u = new URL('https://duckduckgo.com' + link)
            const uddg = u.searchParams.get('uddg')
            if (uddg) link = decodeURIComponent(uddg)
          } catch {}
        }

        // 去重逻辑 - 基于链接
        if (!seenLinks.has(link)) {
          seenLinks.add(link)
          results.push({ link, title, snippet: desc })
        } else {
          logger.info('跳过重复的 DuckDuckGo 结果:', title)
        }
      }
    } catch (error) {
      logger.warn('DuckDuckGo item processing error:', error.message)
    }
  }
  return results
}
async function nextPageDDG(page) {
  // Try explicit more/next button with improved selectors
  const moreSelectors = [
    'a.result--more__btn',
    '.result--more a',
    'button[aria-label="More Results"]',
    'a[aria-label="Next"]',
    '#more-results',
    '.load-more-btn',
    'button:has-text("More Results")',
    'a:has-text("More Results")'
  ]

  for (const selector of moreSelectors) {
    try {
      const more = await page.$(selector)
      if (more && await more.isVisible()) {
        logger.info(`Found DuckDuckGo pagination button with selector: ${selector}`)
        await Promise.all([
          page.waitForLoadState('networkidle'),
          more.click()
        ])
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(1000) // Wait for new results to load
        return true
      }
    } catch (error) {
      logger.warn(`Failed to click DuckDuckGo pagination button with selector ${selector}:`, error.message)
    }
  }

  // Fallback: infinite scroll with improved logic
  const before = await page.$$eval('#links .result, [data-testid="result"]', els => els.length)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(2000) // Longer wait for infinite scroll
  const after = await page.$$eval('#links .result, [data-testid="result"]', els => els.length).catch(() => before)

  const hasNewResults = (after || 0) > (before || 0)
  if (hasNewResults) {
    logger.info(`DuckDuckGo infinite scroll loaded ${after - before} new results`)
  }

  return hasNewResults
}



// Google provider
async function googleNavigate(page, keyword) {
  const url = `https://www.google.com/search?q=${encodeURIComponent(keyword)}`
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS })
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000) // 额外等待时间确保页面完全加载

  const challenged = await detectChallenge(page)
  if (challenged && HUMAN_WAIT_MS > 0 && !HEADLESS) {
    try {
      await page.waitForFunction(() => document.querySelector('#search .g, div.yuRUbf a, .g .LC20lb'), { timeout: HUMAN_WAIT_MS })
    } catch {}
  }
}
async function googleCollect(page) {
  const results = []
  // 使用更精确的选择器避免重复
  const items = await page.$$('#search .g:not(.g-blk), .rc:not(.related-question-pair), .tF2Cxc:not(.M8OgIe), .MjjYud:not(.related-question-pair)')

  const seenLinks = new Set() // 用于去重

  for (const item of items) {
    try {
      let a = await item.$('div.yuRUbf > a, a[jsname="UWckNb"], h3 a')
      if (!a) a = await item.$('a[href^="/url?"]')
      let link = a ? await a.getAttribute('href') : null

      const h3 = await item.$('h3, .LC20lb')
      const title = h3 ? (await h3.innerText()).trim() : null

      // 改进摘要选择器
      const descEl = await item.$('div.VwiC3b, span.aCOpRe, .VwiC3b, .MUxGbd, .lyLwlc, .aCOpRe')
      let desc = descEl ? (await descEl.innerText()).trim() : ''

      // 如果摘要为空，尝试其他选择器
      if (!desc) {
        const altDescEl = await item.$('.s3v9rd, .st, .IsZvec')
        desc = altDescEl ? (await altDescEl.innerText()).trim() : ''
      }

      if (link && title) {
        if (link?.startsWith('/url?')) {
          try {
            const u = new URL('https://www.google.com' + link)
            link = u.searchParams.get('q') || link
          } catch {}
        }

        // 去重逻辑 - 基于链接和标题
        const resultKey = `${link}-${title}`
        if (!seenLinks.has(resultKey)) {
          seenLinks.add(resultKey)
          results.push({ link, title, snippet: desc })
        } else {
          logger.info('跳过重复的 Google 结果:', title)
        }
      }
    } catch (error) {
      // 忽略单个元素的错误，继续处理其他元素
      logger.warn('Google item processing error:', error.message)
    }
  }
  return results
}
async function nextPageGoogle(page) {
  const next = await page.$('a#pnnext, a[aria-label="Next"], a[aria-label="下一页"], .d6cvqb a[aria-label*="Next"], .AaVjTc a:last-child')
  if (!next) return false

  try {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS }),
      next.click()
    ])
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT_MS })
    await page.waitForTimeout(1000) // 额外等待时间
    return true
  } catch (error) {
    logger.warn('Google next page navigation failed:', error.message)
    return false
  }
}

async function extractMainText(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS })
  try {
    await page.waitForLoadState('networkidle', { timeout: 3000 })
  } catch (error) {
    logger.error('Page load networkidle timeout:', error.message)
  }
  const selectors = ['main', '#content', 'article', '[role="main"]', '.post-content', '.entry-content', '.article', '.content', '.page-content']
  for (const sel of selectors) {
    const el = await page.$(sel)
    if (el) {
      const text = await el.innerText()
      const cleaned = text.replace(/\s+\n/g, '\n').trim()
      if (cleaned) return { text: cleaned, isContentPage: true }
    }
  }
  return { text: '', isContentPage: false }
}

const mcpServer = new McpServer({ name: 'myz-search', version: '0.1.0' })

mcpServer.registerTool(
  'search-links',
  {
    title: 'Search links',
    description: `Search keyword on provider (bing|duckduckgo|google). Default ${DEFAULT_PROVIDER}.`,
    inputSchema: { q: z.string(), limit: z.number().min(1).max(50).optional(), provider: z.enum(['bing', 'duckduckgo', 'google']).optional() },
    outputSchema: { results: z.array(z.object({ link: z.string(), title: z.string(), snippet: z.string() })), total: z.number() }
  },
  async ({ q, limit = 10, provider = DEFAULT_PROVIDER }) => {
    const key = (provider || DEFAULT_PROVIDER).toLowerCase()

    // 重试机制
    const maxRetries = 2
    let lastError = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (key === 'bing' && BING_API_KEY) {
          try {
            const results = await searchViaApi(q, limit)
            const payload = { results, total: results.length }
            return { content: [{ type: 'text', text: JSON.stringify(payload) }], structuredContent: payload }
          } catch (e) {
            return { content: [{ type: 'text', text: `Bing API failed: ${e instanceof Error ? e.message : String(e)}` }], isError: true }
          }
        }

        let payload

        if (key === 'bing') {
          // Use Bing browser instance without proxy
          payload = await withBingPage(async (page) => {
            const results = []
            while (results.length < Math.min(limit, 50)) {
              const batch = await bingSearch(page, q)
              for (const r of batch) { if (results.length >= Math.min(limit, 50)) break; results.push(r) }
              if (results.length >= Math.min(limit, 50)) break
              const hasNext = await nextPageBing(page)
              if (!hasNext) break
            }
            return { results, total: results.length }
          })
        } else {
          // Use regular browser instance for other providers
          payload = await withPage(async (page) => {
            const results = []
            if (key === 'duckduckgo') {
              await ddgNavigate(page, q)
              while (results.length < Math.min(limit, 50)) {
                const batch = await ddgCollect(page)
                for (const r of batch) { if (results.length >= Math.min(limit, 50)) break; results.push(r) }
                if (results.length >= Math.min(limit, 50)) break
                const hasNext = await nextPageDDG(page)
                if (!hasNext) break
              }
            } else if (key === 'google') {
              await googleNavigate(page, q)
              while (results.length < Math.min(limit, 50)) {
                const batch = await googleCollect(page)
                for (const r of batch) { if (results.length >= Math.min(limit, 50)) break; results.push(r) }
                if (results.length >= Math.min(limit, 50)) break
                const hasNext = await nextPageGoogle(page)
                if (!hasNext) break
              }
            }
            return { results, total: results.length }
          })
        }

        return { content: [{ type: 'text', text: JSON.stringify(payload) }], structuredContent: payload }

      } catch (error) {
        lastError = error
        logger.warn(`Search attempt ${attempt + 1} failed:`, error.message)

        if (attempt < maxRetries) {
          // 等待一段时间后重试
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
          continue
        }
      }
    }

    // 所有重试都失败
    return {
      content: [{
        type: 'text',
        text: `Search failed after ${maxRetries + 1} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`
      }],
      isError: true
    }
  }
)

mcpServer.registerTool(
  'extract-page-text',
  {
    title: 'Extract main text from URL',
    description: 'Visit a URL and extract main/article content text if present.',
    inputSchema: { url: z.string(), selector: z.string().optional() },
    outputSchema:{ text: z.string(), isContentPage: z.boolean(), url: z.string(), message: z.string() }
  },
  async ({ url, selector }) => {
    const maxRetries = 1
    let lastError = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const out = await withPage(async (page) => {
          if (selector) {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS })
            try {
              await page.waitForLoadState('networkidle', { timeout: 3000 })
            } catch (error) {
              logger.error('Page load networkidle timeout:', error.message)
            }
            await page.waitForTimeout(500) // 额外等待时间
            const el = await page.$(selector)
            if (el) {
              const text = (await el.innerText()).trim()
              return { text, isContentPage: !!text, url, message: text ? '' : '选择器匹配元素无文本' }
            } else {
              return { text: '', isContentPage: false, url, message: '未匹配到选择器元素' }
            }
          } else {
            const r = await extractMainText(page, url)
            return { ...r, url, message: r.isContentPage ? '' : '无法找到主要内容，可能不是内容页面' }
          }
        })

        return {
          content: [{ type: 'text', text: JSON.stringify(out) }],
          structuredContent: out
        }

      } catch (error) {
        lastError = error
        logger.warn(`Extract page text attempt ${attempt + 1} failed:`, error.message)

        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000))
          continue
        }
      }
    }

    // 所有重试都失败
    return {
      content: [{
        type: 'text',
        text: `Failed to extract page text after ${maxRetries + 1} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`
      }],
      isError: true
    }
  }
)

const app = express()
app.use(express.json())

app.post('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true })
  res.on('close', () => transport.close())
  await mcpServer.connect(transport)
  await transport.handleRequest(req, res, req.body)
})

export async function start() {
  if (USE_STDIO) {
    // Use stdio transport
    logger.info('Starting MCP server with stdio transport...')
    const transport = new StdioServerTransport()
    await mcpServer.connect(transport)
    logger.info('MCP server (stdio transport) started and ready')
    logger.info(`HEADLESS=${HEADLESS} CHANNEL=${CHANNEL}`)
    if (PROXY) logger.info(`Using proxy: ${PROXY}`)
    logger.info(`Timeout: ${TIMEOUT_MS}ms`)
    if (PROFILE_DIR) logger.info(`Profile: ${PROFILE_DIR}`)
    if (HUMAN_WAIT_MS) logger.info(`Human-wait: ${HUMAN_WAIT_MS}ms`)
    if (BING_API_KEY) logger.info(`Bing API mode enabled`)
  } else {
    // Use HTTP transport (default)
    const serverHandle = app.listen(PORT, () => {
      logger.info(`MCP server (streamable http) on http://localhost:${PORT}/mcp`)
      logger.info(`HEADLESS=${HEADLESS} CHANNEL=${CHANNEL}`)
      if (PROXY) logger.info(`Using proxy: ${PROXY}`)
      logger.info(`Timeout: ${TIMEOUT_MS}ms`)
      if (PROFILE_DIR) logger.info(`Profile: ${PROFILE_DIR}`)
      if (HUMAN_WAIT_MS) logger.info(`Human-wait: ${HUMAN_WAIT_MS}ms`)
      if (BING_API_KEY) logger.info(`Bing API mode enabled`)
    })
    serverHandle.on('error', (err) => {
      logger.error('Server error:', err)
      process.exit(1)
    })
  }
}

// Export functions for testing
export {
  bingSearch,
  ddgNavigate,
  ddgCollect,
  googleNavigate,
  googleCollect
}
