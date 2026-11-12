# Repository Guide

This repo is a multi‑module suite (extension + libraries). Keep changes scoped to the module you are touching and follow the existing patterns there.

## Layout (high level)
- `myz-annotator/` — Chrome MV3 extension (Vue 3 + JSX, Vite). Core folders:
  - `src/background/` service worker logic (no DOM).
  - `src/content/` content scripts + page UI.
  - `src/popup/`, `src/dashboard/` UI surfaces.
  - `src/pdf/` self-built pdf.js reader page: thin shell `PdfReaderApp.tsx` + `components/` (presentational) + `stores/` (Pinia state slice + composition root `reader-store.ts`) + `composables/` (`usePdfEngine` rendering/scroll/zoom, `usePdfAnnotations`, `usePdfOutline`, `usePdfDocument`, `usePdfBilingual`) + non-reactive helpers (`annotations`, `pdf-document`, `text-blocks`/`text-selection` geometry-based line/paragraph selection, `bilingual` page-column extractor for 对照翻译, `source`, `storage`, `fingerprint`, `detect`). Each page is a `.pdf-page-row` (original sheet + optional mirrored translation column); `.pdf-page` remains the render/eviction/selection unit.
  - `src/epub/` self-built EPUB reader page (reflow): shell `EpubReaderApp.tsx` (composes the components and owns the iframe lifecycle/backdoor) + `components/` (`EpubToolbar`, `EpubSidebar`, `EpubTocPanel`, `EpubHighlightsPanel`, `EpubStage`, `EpubHighlightPanel`) + `stores/reader-store.ts` + non-reactive helpers (`parse` container/OPF/nav/NCX + async `parseEpubAsync`, `unzip.worker` off-thread archive decompression, `render` iframe + read typography, `highlights` painting, `toc` path/filter, `bilingual` chapter extractor + mirrored column for 对照翻译, `source`, `storage`, `open`, `fingerprint`). Reflow has no pages, so anchors are spine + text quote, not coordinates; the bilingual column mirrors document coordinates and follows the iframe scroll.
  - `src/reader/` shared by the PDF and EPUB readers: `reader-chrome.css` (toolbar, sidebar/outline, highlight list, states, selection toolbar, inspector) plus shared presentational components (`ReaderSidebar`, `ReaderOutlineList`, `ReaderHighlightRow`, `SelectionToolbar`, `TranslationPopover`, `ReaderSelectionTools`, `ReaderLanding`, `BilingualControl`) and helpers (`text`, `translation-popover.css`, `local-file`, `source`, `progress-store`). `translate/` is the on-device translation core — injectable `TranslationEngine` (`browser-engine` over Chrome Translator/Language Detector), language mapping, chunking, local cache (`myz_translate_db`, or `chrome.storage.local` in content scripts), service/errors, the `useTranslation` selection popover composable, and the incremental `bilingual.ts` session + `useBilingual` used by the readers' 对照翻译 (side-by-side) mode. `bilingual-pane.ts` paints the mirrored translated column (absolute blocks pinned to source offsets) and `bilingual.css` holds the two-column/menu styles. Both readers and the web content toolbar reuse this core; content scripts are subject to the host page's `Permissions-Policy`, so a blocked API degrades to a clear unsupported message.
  - `src/stitch/` self-built image stitching/composition page (`stitch.html` + `StitchApp.tsx`), a port of the sibling `../stitch-web` tool: `core/` holds the framework-agnostic algorithms (gray/matching/stitch/layouts/showcase/export), `modes/` the three editors (截图拼接/拼图/展示图), `components/` the Vue primitives + `PreviewCanvas`/`AssetTray`/`ExportPanel`/`StagingPicker`, `stores/` the Pinia asset list and the capture-cache (`staged-asset.ts` model + `stores/staging.ts`). It opens on the capture-cache picker and reads/writes staged images through background messages; see `docs/knowledges/stitch-web-port.md` for the port rationale.
  - `src/content/` also hosts media capture: `capture-media.ts` imports page images / grabs the current video frame, stages a copy (`myz:stageAsset`) and downloads it; `messages/capture.ts` registers the content handlers.
  - `src/content/` also hosts the external-AI hand-off: the toolbar's 解读 button (off by default — third-party data warning in settings) runs `ask-ai.ts` (prompt from `selectionBlocks`; a selection containing images is screenshotted once, like 截取) → `myz:askAi` → `background/messages/ask-ai.ts` (provider + prompt template from settings, resolve the chat tab, new chat, and pair it beside the source page via the Chrome 155+ Split View API, falling back to focusing the tab; notifies on missing login) → `myz:aiCompose` → `content/ai-compose.ts` on the chat site (fills the composer, enables the provider's thinking mode when it has one, pastes the image; never submits). Site/DOM facts per provider: `docs/knowledges/ai-chat-integrations.md`. Provider descriptors (DeepSeek + Qwen, both live) live in `src/ai/providers.ts`; the template/placeholder rendering is `src/ai/prompt.ts`; the AI settings slice is `src/ai/settings.ts` (dashboard page: `settings/ai`).
- `packages/shared/` (`@myz/shared`) — environment-agnostic shared utilities, schemas, types, messaging, theme, icons, and highlight helpers shared across hosts (extension/desktop); referenced via `@myz/shared/*`. Notable: `highlightRange` (document-agnostic range wrapping used by both the web content script and the EPUB reader), `serializer` (range anchoring), `cjk`/`fonts` (language → Noto Serif), `theme/tokens.css` + `theme/tailwind.css`.
- `docs/` — internal docs. See `docs/AGENTS.md` for structure (knowledges/legal/plan/research).
- `workflow/` — automation workflows and pipelines (e.g., `workflow/video-pipeline`).
  - `workflow/video-pipeline/skills/screen-recording-narrator/scripts/` — command/script templates for the video pipeline.
- `packages/core/` (`@myz/core`) — environment-agnostic domain layer: model registries (record identity, source kind, locator, payload codec, lifecycle, relations), pure read models (e.g. `buildInboxQueue`) and the undoable delete session (§4.30). No chrome/DOM/IO; hosts supply storage/transport via ports. Depends on `@myz/shared` (+ `zod`). See `docs/plan/implemented/core-refactor.md`.
- `packages/dashboard-ui/` — shared non-chat dashboard UI building blocks such as app shells, sidebars, and reusable inputs. The workspace chrome lives in `src/workspace/`: `WorkspaceShell` (rail / nav / main / panel four-region grid), `NavRail`, `ResizeHandle` and the local-only width helpers; `ListRow` (flush 56px record row) and `StatusPill` (§4.29 status pill) are the shared list primitives; `QuickSearch` is shared by the workspace header and the legacy top navbar. Prefer wiring app stores into these components from page/container layers instead of re-copying the visuals per host.
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
- **共享工作区是独占的，且必须「声明占用」才算数**：改文件、切分支、`git mv` 之前，先在协作频道声明占用，做完释放。看一眼工作区干净不等于占用——中间几分钟别人可能就回来；没有声明就不要切分支。
- **文档类改动优先用独立 worktree**：`git worktree add /tmp/<name> -b <branch> origin/master`，在临时目录里改和提交，不动共享目录的分支，做完 `git worktree remove`。提交一律显式列文件，不用 `git add -A` / `git add .`。

## AGENTS.md upkeep
- When a directory's structure or responsibilities change, update the nearest `AGENTS.md`.
- Re-scan AGENTS with `rg --files -g 'AGENTS.md'` and keep cross-references current.

## Testing Notes
- myz-annotator Playwright runs against built output; run `npm run build` first.
- Sync tests do not use a hand-written S3 mock: they run against `fakes3`
  (`fakes3-sdk`, `auth: true` verifies SigV4) and use `@aws-sdk/client-s3` as an
  independent oracle. See `docs/knowledges/s3-client.md`.

## Code Quality
- `npm run jscpd` runs JSCPD (Copy/Paste Detector) to find duplicate code across the repo.
- Configuration lives in `.jscpd.json` at the root — adjust thresholds there as needed.

## Worklog
- Current state: `.agents/workstate.md` — compact snapshot (focus, status, recent, next); replace stale content instead of appending history.
- Entries: `.agents/worklog/YYYY-MM-DD.md` — one file per day; append same-day entries to the same file.
- Format: ISO timestamp heading (`## YYYY-MM-DDTHH:MM:SS+08:00`), then what changed and why (one entry per logical change).