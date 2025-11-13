import express from 'express'
import { chromium } from 'playwright'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { Command } from 'commander'

// CLI arg parser using commander
function parseArgs(argv) {
  const program = new Command()
  program
    .storeOptionsAsProperties(false)
    .passThroughOptions(false)
    .option('--port <number>', 'port number', v => Number(v))
    .option('--proxy <proxy>', 'proxy server')
    .option('--timeout <ms>', 'navigation timeout in ms', v => Number(v))
    .option('--headless <boolean>', 'headless mode true/false', v => v === 'true')
    .option('--channel <name>', 'browser channel')
    .option('--profile <dir>', 'persistent user data directory')
    .option('--human-wait <ms>', 'wait ms for human to solve challenge', v => Number(v))

  program.parse(argv, { from: 'user' })
  const opts = program.opts()
  return {
    port: opts.port,
    proxy: opts.proxy,
    timeout: opts.timeout,
    headless: opts.headless,
    channel: opts.channel,
    profile: opts.profile,
    humanWait: opts.humanWait
  }
}

const ARGS = parseArgs(process.argv.slice(2))
const ENV = process.env

const PORT = (ARGS.port ?? (ENV.MYZ_SEARCH_PORT ? Number(ENV.MYZ_SEARCH_PORT) : (ENV.PORT ? Number(ENV.PORT) : 3000)))
const PROXY = (ARGS.proxy ?? ENV.MYZ_SEARCH_PROXY) || undefined
const TIMEOUT_MS = (ARGS.timeout ?? (ENV.MYZ_SEARCH_TIMEOUT ? Number(ENV.MYZ_SEARCH_TIMEOUT) : undefined)) ?? 30000
const HEADLESS = ARGS.headless ?? (ENV.HEADLESS ? ENV.HEADLESS !== 'false' : true)
const CHANNEL = ARGS.channel ?? (ENV.CHANNEL || 'chrome')
const PROFILE_DIR = ARGS.profile ?? ENV.MYZ_SEARCH_PROFILE_DIR
const HUMAN_WAIT_MS = ARGS.humanWait ?? (ENV.MYZ_SEARCH_HUMAN_WAIT ? Number(ENV.MYZ_SEARCH_HUMAN_WAIT) : 0)
const BING_API_KEY = ENV.MYZ_SEARCH_BING_API_KEY || ENV.BING_API_KEY

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

async function shutdownBrowser() {
  try { await PAGE?.close() } catch {}
  try { await CONTEXT?.close() } catch {}
  try { await BROWSER?.close() } catch {}
  PAGE = null; CONTEXT = null; BROWSER = null
}

async function bingSearch(page, keyword) {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(keyword)}`
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS })
  await page.waitForLoadState('networkidle')
  const results = []
  let items = await page.$$('[data-testid="result"]')
  if (items.length === 0) {
    // Detect potential challenge and optionally wait for human to solve
    const challenged = await detectChallenge(page)
    if (challenged && HUMAN_WAIT_MS > 0 && !HEADLESS) {
      try {
        await page.waitForFunction(() => document.querySelector('[data-testid="result"], .b_algo'), { timeout: HUMAN_WAIT_MS })
        items = await page.$$('[data-testid="result"]')
      } catch {}
    }
    const legacyItems = items.length ? [] : await page.$$('.b_algo')
    for (const item of legacyItems) {
      const a = await item.$('h2 a')
      const link = a ? await a.getAttribute('href') : null
      const title = a ? await a.innerText() : null
      const descEl = await item.$('.b_caption p')
      const desc = descEl ? await descEl.innerText() : ''
      if (link && title) results.push({ link, title, snippet: desc })
    }
    return results
  }
  for (const item of items) {
    const a = await item.$('a')
    const link = a ? await a.getAttribute('href') : null
    const titleEl = await item.$('h2')
    const title = titleEl ? await titleEl.innerText() : null
    const descEl = await item.$('p')
    const desc = descEl ? await descEl.innerText() : ''
    if (link && title) results.push({ link, title, snippet: desc })
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
}
async function ddgCollect(page) {
  const results = []
  const items = await page.$$('[data-testid="result"], #links .result, .react-results--main [data-layout="organic"] .result')
  for (const item of items) {
    const a = await item.$('a[data-testid="result-title-a"], h2 a, a.result__a')
    let link = a ? await a.getAttribute('href') : null
    const title = a ? (await a.innerText()).trim() : null
    const descEl = await item.$('[data-testid="result-snippet"], .result__snippet, .js-result-extras')
    const desc = descEl ? (await descEl.innerText()).trim() : ''
    if (link && title) {
      if (link.startsWith('/l/?')) {
        try {
          const u = new URL('https://duckduckgo.com' + link)
          const uddg = u.searchParams.get('uddg')
          if (uddg) link = decodeURIComponent(uddg)
        } catch {}
      }
      results.push({ link, title, snippet: desc })
    }
  }
  return results
}
async function nextPageDDG(page) {
  // Try explicit more/next button
  const more = await page.$('a.result--more__btn, .result--more a, button[aria-label="More Results"], a[aria-label="Next"]')
  if (more) {
    await Promise.all([
      page.waitForLoadState('networkidle'),
      more.click()
    ])
    await page.waitForLoadState('networkidle')
    return true
  }
  // Fallback: infinite scroll
  const before = await page.$$eval('#links .result, [data-testid="result"]', els => els.length)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(1200)
  const after = await page.$$eval('#links .result, [data-testid="result"]', els => els.length).catch(() => before)
  return (after || 0) > (before || 0)
}

// Yandex provider
async function yandexNavigate(page, keyword) {
  const url = `https://yandex.com/search/?text=${encodeURIComponent(keyword)}`
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS })
  await page.waitForLoadState('networkidle')
}
async function yandexCollect(page) {
  const results = []
  const items = await page.$$('.serp-item, li.serp-item, .Organic, .VanillaOrganic')
  for (const item of items) {
    const a = await item.$('a.OrganicTitle-Link, h2 a, a.Link[href]')
    let link = a ? await a.getAttribute('href') : null
    const title = a ? (await a.innerText()).trim() : null
    const descEl = await item.$('.OrganicText, .TextContainer, .extended-text__short, .Organic-Content')
    const desc = descEl ? (await descEl.innerText()).trim() : ''
    if (link && title) {
      if (link.includes('yandex') && link.includes('jsredir')) {
        try {
          const u = new URL(link)
          const urlParam = u.searchParams.get('url')
          if (urlParam) link = decodeURIComponent(urlParam)
        } catch {}
      }
      results.push({ link, title, snippet: desc })
    }
  }
  return results
}
async function nextPageYandex(page) {
  const next = await page.$('a.Pager-Button_next, a[aria-label="Следующая страница"], a[aria-label="Next page"]')
  if (!next) return false
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS }),
    next.click()
  ])
  await page.waitForLoadState('networkidle')
  return true
}

// Baidu provider
async function baiduNavigate(page, keyword) {
  const url = `https://www.baidu.com/s?wd=${encodeURIComponent(keyword)}`
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS })
  await page.waitForLoadState('networkidle')
}
async function baiduCollect(page) {
  const results = []
  const items = await page.$$('#content_left .result, #content_left .c-container')
  for (const item of items) {
    const a = await item.$('h3 a')
    const link = a ? await a.getAttribute('href') : null
    const title = a ? (await a.innerText()).trim() : null
    const descEl = await item.$('.c-abstract, .c-gap-top-small, .c-color-text, .content-right')
    const desc = descEl ? (await descEl.innerText()).trim() : ''
    if (link && title) results.push({ link, title, snippet: desc })
  }
  return results
}
async function nextPageBaidu(page) {
  const next = await page.$('#page a.n, a.n[aria-label="下一页"]')
  if (!next) return false
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS }),
    next.click()
  ])
  await page.waitForLoadState('networkidle')
  return true
}

// Google provider
async function googleNavigate(page, keyword) {
  const url = `https://www.google.com/search?q=${encodeURIComponent(keyword)}`
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS })
  await page.waitForLoadState('networkidle')
  const challenged = await detectChallenge(page)
  if (challenged && HUMAN_WAIT_MS > 0 && !HEADLESS) {
    try {
      await page.waitForFunction(() => document.querySelector('#search .g, div.yuRUbf a'), { timeout: HUMAN_WAIT_MS })
    } catch {}
  }
}
async function googleCollect(page) {
  const results = []
  const items = await page.$$('#search .g, .rc')
  for (const item of items) {
    let a = await item.$('div.yuRUbf > a')
    if (!a) a = await item.$('a[href^="/url?"]')
    let link = a ? await a.getAttribute('href') : null
    const h3 = await item.$('h3')
    const title = h3 ? (await h3.innerText()).trim() : null
    const descEl = await item.$('div.VwiC3b, span.aCOpRe')
    const desc = descEl ? (await descEl.innerText()).trim() : ''
    if (link && title) {
      if (link?.startsWith('/url?')) {
        try {
          const u = new URL('https://www.google.com' + link)
          link = u.searchParams.get('q') || link
        } catch {}
      }
      results.push({ link, title, snippet: desc })
    }
  }
  return results
}
async function nextPageGoogle(page) {
  const next = await page.$('a#pnnext, a[aria-label="Next"]')
  if (!next) return false
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS }),
    next.click()
  ])
  await page.waitForLoadState('networkidle')
  return true
}

async function extractMainText(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS })
  await page.waitForLoadState('networkidle')
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
    description: 'Search keyword on provider (bing|duckduckgo|yandex|baidu|google). Default bing.',
    inputSchema: { q: z.string(), limit: z.number().min(1).max(50).optional(), provider: z.enum(['bing', 'duckduckgo', 'yandex', 'baidu', 'google']).optional() },
    outputSchema: { results: z.array(z.object({ link: z.string(), title: z.string(), snippet: z.string() })), total: z.number() }
  },
  async ({ q, limit = 10, provider = 'bing' }) => {
    const key = (provider || 'bing').toLowerCase()
    if (key === 'bing' && BING_API_KEY) {
      try {
        const results = await searchViaApi(q, limit)
        const payload = { results, total: results.length }
        return { content: [{ type: 'text', text: JSON.stringify(payload) }], structuredContent: payload }
      } catch (e) {
        return { content: [{ type: 'text', text: `Bing API failed: ${e instanceof Error ? e.message : String(e)}` }], isError: true }
      }
    }
    const payload = await withPage(async (page) => {
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
      } else if (key === 'yandex') {
        await yandexNavigate(page, q)
        while (results.length < Math.min(limit, 50)) {
          const batch = await yandexCollect(page)
          for (const r of batch) { if (results.length >= Math.min(limit, 50)) break; results.push(r) }
          if (results.length >= Math.min(limit, 50)) break
          const hasNext = await nextPageYandex(page)
          if (!hasNext) break
        }
      } else if (key === 'baidu') {
        await baiduNavigate(page, q)
        while (results.length < Math.min(limit, 50)) {
          const batch = await baiduCollect(page)
          for (const r of batch) { if (results.length >= Math.min(limit, 50)) break; results.push(r) }
          if (results.length >= Math.min(limit, 50)) break
          const hasNext = await nextPageBaidu(page)
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
      } else {
        // default to bing
        while (results.length < Math.min(limit, 50)) {
          const batch = await bingSearch(page, q)
          for (const r of batch) { if (results.length >= Math.min(limit, 50)) break; results.push(r) }
          if (results.length >= Math.min(limit, 50)) break
          const hasNext = await nextPageBing(page)
          if (!hasNext) break
        }
      }
      return { results, total: results.length }
    })
    return { content: [{ type: 'text', text: JSON.stringify(payload) }], structuredContent: payload }
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
    const out = await withPage(async (page) => {
      if (selector) {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS })
        await page.waitForLoadState('networkidle')
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

export function start() {
  const serverHandle = app.listen(PORT, () => {
    console.log(`MCP server (streamable http) on http://localhost:${PORT}/mcp`)
    console.log(`HEADLESS=${HEADLESS} CHANNEL=${CHANNEL}`)
    if (PROXY) console.log(`Using proxy: ${PROXY}`)
    console.log(`Timeout: ${TIMEOUT_MS}ms`)
    if (PROFILE_DIR) console.log(`Profile: ${PROFILE_DIR}`)
    if (HUMAN_WAIT_MS) console.log(`Human-wait: ${HUMAN_WAIT_MS}ms`)
    if (BING_API_KEY) console.log(`Bing API mode enabled`)
  })
  serverHandle.on('error', (err) => {
    console.error('Server error:', err)
    process.exit(1)
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  start()
  process.on('SIGINT', async () => { await shutdownBrowser(); process.exit(0) })
  process.on('SIGTERM', async () => { await shutdownBrowser(); process.exit(0) })
}
