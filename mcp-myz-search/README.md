# MCP MyZ Search

Poorman's search mcp.

## Usage


```
npx playwright install chromium
npx mcp-myz-search
```

## Command line options
```
Usage: program [options]

Options:
  --default-provider <provider>  default search provider (choices: "bing", "duckduckgo", "google", default: "bing")
  --port <number>                port number
  --proxy <proxy>                proxy server
  --timeout <ms>                 navigation timeout in ms
  --headed                       headed mode
  --channel <name>               browser channel (default: "chrome")
  --profile <dir>                persistent user data directory
  --human-wait <ms>              wait ms for human to solve challenge
  --stdio                        use stdio transport instead of HTTP
  --log-file <path>              log file path (default: stderr)
  -h, --help                     display help for command
```

## Server Parameters (startup only)
- `--port <number>` or `MYZ_SEARCH_PORT` (fallback `PORT`), default `3000`.
- `--proxy <http|socks URL>` or `MYZ_SEARCH_PROXY` applied to Playwright.
- `--timeout <ms>` or `MYZ_SEARCH_TIMEOUT` for navigation/default timeouts.
- `--profile <dir>` or `MYZ_SEARCH_PROFILE_DIR` to persist session/cookies.
- `--human-wait <ms>` or `MYZ_SEARCH_HUMAN_WAIT` to allow human challenge solve in non-headless.

## MCP HTTP Endpoint
- Streamable HTTP MCP at `POST /mcp` using `@modelcontextprotocol/sdk`.
- Tools:
  - `search-links` args `{ q: string; limit?: number<=50; provider?: 'bing'|'duckduckgo'|'google' }` returns `{ results: Array<{link,title,snippet}>, total }`.
    - Provider defaults to `bing`, or you can change it via `--default-provider` switch.
  - `extract-page-text` args `{ url: string; selector?: string }` returns `{ text, isContentPage, url, message }`.

## Providers
- `bing`
- `duckduckgo`
- `google`

## Examples
- Custom port + proxy: `npx mcp-myz-search --port 3100 --proxy socks5://127.0.0.1:1080`
- Persistent profile + human wait: `npx mcp-myz-search --headed --profile ~/.myz-bing --human-wait 20000`

Notes
- The server reuses a single Playwright browser/context/page and serializes access to improve performance.
- Challenge pages are detected; when not using API, you can allow human solve via `--human-wait` in non-headless mode.
- Text extraction prefers `main`, `#content`, `article`, or a provided selector; returns a message when content is not found.
