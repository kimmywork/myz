# @myz-suite/desktop Design Status

The previous `myz-suite-tool` design documents described placeholder UI flows and an in-app MCP gateway implementation. Those designs are no longer current.

`@myz-suite/desktop` is now treated as a clean Tauri desktop container that will receive:

1. a shared dashboard shell extracted from `myz-annotator`
2. a host-neutral notes and summaries workspace built on `MyZRecord`
3. Tauri host adapters for desktop persistence and later agent workflows

Detailed replacement design work is tracked in `docs/track/v19-suite-tool-dashboard-extraction.md`.
