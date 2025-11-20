import http from 'node:http'
import { spawn } from 'node:child_process'

function postMCP(body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: 'localhost', port: 3000, path: '/mcp', method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' } })
    req.on('response', (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        console.log('HTTP', res.statusCode)
        console.log(data)
        resolve(undefined)
      })
    })
    req.on('error', reject)
    req.write(JSON.stringify(body))
    req.end()
  })
}

async function main() {
  const env = { ...process.env, HEADLESS: process.env.HEADLESS ?? 'true' }
  const server = spawn('node', ['src/mcp-server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  server.stdout.on('data', (d) => process.stdout.write(String(d)))
  server.stderr.on('data', (d) => process.stderr.write(String(d)))
  await new Promise((r) => setTimeout(r, 1000))

  console.log('--- MCP tools/call search-links ---')
  await postMCP({
    method: 'tools/call',
    params: { name: 'search-links', arguments: { q: 'Playwright Bing', limit: 5, headless: true } },
    id: '1',
    jsonrpc: '2.0'
  })

  console.log('--- MCP tools/call extract-page-text ---')
  await postMCP({
    method: 'tools/call',
    params: { name: 'extract-page-text', arguments: { url: 'https://playwright.dev/', headless: true } },
    id: '2',
    jsonrpc: '2.0'
  })

  server.kill()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
