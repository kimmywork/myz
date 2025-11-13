# MCP Server: Streaming HTTP search & extract

## Usage
- Install deps: `npm install` and browsers: `npx playwright install chromium`
- Start server: `npm run dev`
- Visual run: set `HEADLESS=false` (env) for non-headless debugging.

## Server Parameters (startup only)
- `--port <number>` or `MYZ_SEARCH_PORT` (fallback `PORT`), default `3000`.
- `--proxy <http|socks URL>` or `MYZ_SEARCH_PROXY` applied to Playwright.
- `--timeout <ms>` or `MYZ_SEARCH_TIMEOUT` for navigation/default timeouts.
- `--profile <dir>` or `MYZ_SEARCH_PROFILE_DIR` to persist session/cookies.
- `--human-wait <ms>` or `MYZ_SEARCH_HUMAN_WAIT` to allow human challenge solve in non-headless.
- Global envs: `HEADLESS` (default `true`), `CHANNEL` (default `chrome`).
- Optional: `MYZ_SEARCH_BING_API_KEY`/`BING_API_KEY` to use Bing API (no CAPTCHA).

## MCP HTTP Endpoint
- Streamable HTTP MCP at `POST /mcp` using `@modelcontextprotocol/sdk`.
- Tools:
  - `search-links` args `{ q: string; limit?: number<=50; provider?: 'bing'|'duckduckgo'|'yandex'|'baidu'|'google' }` returns `{ results: Array<{link,title,snippet}>, total }`.
    - Provider defaults to `bing`. With Bing API key set, uses API to avoid verification.
  - `extract-page-text` args `{ url: string; selector?: string }` returns `{ text, isContentPage, url, message }`.

## Providers
- `bing` (challenge-aware; API fallback if key provided)
- `duckduckgo`
- `yandex`
- `baidu`
- `google` (challenge-aware)

## Examples
- Custom port + proxy: `node src/mcp-server.js --port 3100 --proxy socks5://127.0.0.1:1080`
- Persistent profile + human wait: `HEADLESS=false node src/mcp-server.js --profile ~/.myz-bing --human-wait 20000`
- Call `search-links` (curl):
  - `curl -X POST http://localhost:3000/mcp -H 'Accept: application/json, text/event-stream' -H 'Content-Type: application/json' -d '{"method":"tools/call","params":{"name":"search-links","arguments":{"q":"Playwright","limit":10,"provider":"duckduckgo"}},"id":"1","jsonrpc":"2.0"}'`
- Call `extract-page-text` (curl):
  - `curl -X POST http://localhost:3000/mcp -H 'Accept: application/json, text/event-stream' -H 'Content-Type: application/json' -d '{"method":"tools/call","params":{"name":"extract-page-text","arguments":{"url":"https://playwright.dev/","selector":"main"}},"id":"2","jsonrpc":"2.0"}'`

Notes
- The server reuses a single Playwright browser/context/page and serializes access to improve performance.
- Challenge pages are detected; when not using API, you can allow human solve via `--human-wait` in non-headless mode.
- Text extraction prefers `main`, `#content`, `article`, or a provided selector; returns a message when content is not found.
