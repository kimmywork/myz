# Repository Guide

This repo is a multi‑module suite (extension + libraries). Keep changes scoped to the module you are touching and follow the existing patterns there.

## Layout (high level)
- `myz-annotator/` — Chrome MV3 extension (Vue 3 + JSX, Vite). Core folders:
  - `src/background/` service worker logic (no DOM).
  - `src/content/` content scripts + page UI.
  - `src/popup/`, `src/dashboard/` UI surfaces.
  - `src/pdf/` self-built pdf.js reader page: thin shell `PdfReaderApp.tsx` + `components/` (presentational) + `stores/` (Pinia state slice + composition root `reader-store.ts`) + `composables/` (`usePdfEngine` rendering/scroll/zoom, `usePdfAnnotations`, `usePdfOutline`, `usePdfDocument`) + non-reactive helpers (`annotations`, `pdf-document`, `text-blocks`/`text-selection` geometry-based line/paragraph selection, `source`, `storage`, `fingerprint`, `detect`).
  - `src/epub/` self-built EPUB reader page (reflow): shell `EpubReaderApp.tsx` (composes the components and owns the iframe lifecycle/backdoor) + `components/` (`EpubToolbar`, `EpubSidebar`, `EpubTocPanel`, `EpubHighlightsPanel`, `EpubStage`, `EpubHighlightPanel`) + `stores/reader-store.ts` + non-reactive helpers (`parse` container/OPF/nav/NCX + async `parseEpubAsync`, `unzip.worker` off-thread archive decompression, `render` iframe + read typography, `highlights` painting, `toc` path/filter, `source`, `storage`, `open`, `fingerprint`). Reflow has no pages, so anchors are spine + text quote, not coordinates.
  - `src/reader/` shared by the PDF and EPUB readers: `reader-chrome.css` (toolbar, sidebar/outline, highlight list, states, selection toolbar, inspector) plus shared presentational components (`ReaderSidebar`, `ReaderOutlineList`, `ReaderHighlightRow`, `SelectionToolbar`, `TranslationPopover`, `ReaderSelectionTools`, `ReaderLanding`) and helpers (`text`, `translation-popover.css`, `local-file`, `source`, `progress-store`). `translate/` is the on-device translation core — injectable `TranslationEngine` (`browser-engine` over Chrome Translator/Language Detector), language mapping, chunking, local cache (`myz_translate_db`, or `chrome.storage.local` in content scripts), service/errors, and the `useTranslation` composable. Both readers and the web content toolbar reuse this core; content scripts are subject to the host page's `Permissions-Policy`, so a blocked API degrades to a clear unsupported message.
  - `src/stitch/` self-built image stitching/composition page (`stitch.html` + `StitchApp.tsx`), a port of the sibling `../stitch-web` tool: `core/` holds the framework-agnostic algorithms (gray/matching/stitch/layouts/showcase/export), `modes/` the three editors (截图拼接/拼图/展示图), `components/` the Vue primitives + `PreviewCanvas`/`AssetTray`/`ExportPanel`/`StagingPicker`, `stores/` the Pinia asset list and the capture-cache (`staged-asset.ts` model + `stores/staging.ts`). It opens on the capture-cache picker and reads/writes staged images through background messages; see `docs/knowledges/stitch-web-port.md` for the port rationale.
  - `src/content/` also hosts media capture: `capture-media.ts` imports page images / grabs the current video frame, stages a copy (`myz:stageAsset`) and downloads it; `messages/capture.ts` registers the content handlers.
- `packages/shared/` (`@myz/shared`) — environment-agnostic shared utilities, schemas, types, messaging, theme, icons, and highlight helpers shared across hosts (extension/desktop); referenced via `@myz/shared/*`. Notable: `highlightRange` (document-agnostic range wrapping used by both the web content script and the EPUB reader), `serializer` (range anchoring), `cjk`/`fonts` (language → Noto Serif), `theme/tokens.css` + `theme/tailwind.css`.
- `docs/` — internal docs. See `docs/AGENTS.md` for structure (knowledges/legal/plan/research).
- `workflow/` — automation workflows and pipelines (e.g., `workflow/video-pipeline`).
  - `workflow/video-pipeline/skills/screen-recording-narrator/scripts/` — command/script templates for the video pipeline.
- `packages/core/` (`@myz/core`) — environment-agnostic domain layer: model registries (record identity, source kind, locator, payload codec, lifecycle, relations) and pure read models (e.g. `buildInboxQueue`). No chrome/DOM/IO; hosts supply storage/transport via ports. Depends on `@myz/shared` (+ `zod`). See `docs/plan/core-refactor.md`.
- `packages/dashboard-core/` — shared dashboard host contracts (record/settings/theme/sync repositories and host capability presets) for extension, desktop, and mobile-extension adapters.
- `packages/dashboard-ui/` — shared non-chat dashboard UI building blocks such as app shells, sidebars, and reusable inputs. Prefer wiring app stores into these components from page/container layers instead of re-copying the visuals per host.
- `packages/sync-core/` — environment-agnostic E2EE sync core: crypto, protocol schemas, manifest/chunk handling, remote repository helpers, adapter interfaces.

## Common Commands
myz-annotator:
- `npm run dev` / `npm run build`
- `npm run lint` / `npm run test:playwright`

Root:
- `npm run jscpd` — detect code duplication (configured via `.jscpd.json`; threshold 5%)
- `npm run jscpd:check` — strict check (threshold 0%, exit code 1 on any duplicates)

Other modules: check each module's `package.json` for scripts.

## Engineering Conventions (concise)
- Indent 2 spaces; avoid semicolons in TS/TSX files.
- Size guardrails (repo-wide, all ts/tsx/js/jsx/mjs/cjs via `eslint.config.base.js`): lines ≤ 120 chars (`max-len`; unbreakable URLs/strings/templates/regex ignored); files ≤ ~300 lines target (`max-lines` currently warns at 400 as a staged limit). Split rather than grow oversized modules.
- All new code must be TypeScript.
- Schema-first: update/extend schemas and types before UI or storage changes.
- Vue uses Composition API + JSX; state via Pinia.
- Background service workers must be DOM‑free; keep message payloads serializable.
- Prefer shared utilities/types in `packages/shared/` (`@myz/shared`) over duplicating logic in app modules.
- Import convention: cross-package code uses deep paths (e.g. `@myz/shared/types`, `@myz/shared/idb`); the package root index is reserved for type aggregation only. New shared modules must add a `package.json` `exports` entry.
- `@myz/shared` is environment-agnostic. The browser/extension-only modules (`messaging`, `theme`, `colorScheme`, `sanitizeHtml`, `idb`) guard their APIs at call time, so importing them never throws outside a browser; do not import them from non-browser hosts (inject storage/DOM adapters instead).
- Dashboard uses Vue Router (`myz-annotator/src/dashboard/router.ts`); add new settings sections as routes and sidebar items.
- Highlight records should use shared schemas/types (`MyZRecord`, `RECORD_KINDS`, serializers).
- Highlight rendering: range wrapping / re-anchoring is shared (`@myz/shared/highlightRange` + `serializer`) and reused by the content script and EPUB reader. Only the per-surface decorator stays local (`content/apply-highlight.ts`, `epub/highlights.ts`, `pdf/annotations/decorations.ts`); PDF keeps its own span/rect semantics deliberately.

## AGENTS.md upkeep
- When a directory's structure or responsibilities change, update the nearest `AGENTS.md`.
- Re-scan AGENTS with `rg --files -g 'AGENTS.md'` and keep cross-references current.

## Testing Notes
- myz-annotator Playwright runs against built output; run `npm run build` first.

## Code Quality
- `npm run jscpd` runs JSCPD (Copy/Paste Detector) to find duplicate code across the repo.
- Configuration lives in `.jscpd.json` at the root — adjust thresholds there as needed.

## Worklog
- Current state: `.agents/worklog/WORKSTATE.md`
- Entries: `.agents/worklog/YYYY-MM.md` (monthly rotation)
- Format: ISO timestamp, then what changed and why (one entry per logical change)