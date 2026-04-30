# @myz-suite/desktop

`@myz-suite/desktop` is the workspace package for the Tauri desktop host of the shared MyZ dashboard architecture.

## Current status

- Existing placeholder frontend routes and views have been removed.
- Existing Tauri MCP gateway/runtime logic has been removed.
- The app now keeps only the minimal Tauri + Vue bootstrap required to receive the new shared notes workspace.

## Near-term direction

1. Unify frontend dependencies with `myz-annotator`.
2. Extract shared dashboard shell and notes workspace modules.
3. Add host adapters for Tauri desktop, browser extension, and future mobile extensions.

## Commands

```bash
npm install
npm run lint
npm run build
```
