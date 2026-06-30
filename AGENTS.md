# Repository Guide

This repo is a multi‑module suite (extensions + website + libraries). Keep changes scoped to the module you are touching and follow the existing patterns there.

## Layout (high level)
- `myz-annotator/` — Chrome MV3 extension (Vue 3 + JSX, Vite). Core folders:
  - `src/background/` service worker logic (no DOM).
  - `src/content/` content scripts + page UI.
  - `src/popup/`, `src/dashboard/`, `src/sidepanel/` UI surfaces.
  - `src/shared/` shared utilities/types.
- `website/` — VitePress site (user‑facing docs). Content lives in Markdown under `website/annotator/`, `website/danmaku/`, `website/en/`, `website/guide/`.
- `docs/` — internal docs. See `docs/AGENTS.md` for structure (knowledges/track/research/legal/archives).
- `workflow/` — automation workflows and pipelines (e.g., `workflow/video-pipeline`).
  - `workflow/video-pipeline/skills/screen-recording-narrator/scripts/` — command/script templates for the video pipeline.
- `myz-danmaku/` — MV3 extension for danmaku overlay.
- `packages/dashboard-core/` — shared dashboard host contracts (record/settings/theme/sync repositories and host capability presets) for extension, desktop, and mobile-extension adapters.
- `packages/dashboard-ai-settings/` — shared dashboard AI settings UI primitives and catalogs. Keep host-specific state, tests, and runtime actions in app-local contexts; do not fork the presentational components per host.
- `packages/dashboard-chat-ui/` — shared dashboard and sidepanel chat shells, message primitives, list/composer bases, and chat modals. Keep runtime, stores, page-context rendering, and host-only citation behaviors outside this package.
- `packages/dashboard-ui/` — shared non-chat dashboard UI building blocks such as app shells, sidebars, and reusable inputs. Prefer wiring app stores into these components from page/container layers instead of re-copying the visuals per host.
- `packages/sync-core/` — environment-agnostic E2EE sync core: crypto, protocol schemas, manifest/chunk handling, remote repository helpers, adapter interfaces.

## Common Commands
myz-annotator:
- `npm run dev` / `npm run build`
- `npm run lint` / `npm run test:playwright`

website (VitePress):
- `npm run dev` / `npm run build` / `npm run preview`

Other modules: check each module’s `package.json` for scripts.

## Engineering Conventions (concise)
- Indent 2 spaces; avoid semicolons in TS/TSX files.
- All new code must be TypeScript.
- Schema-first: update/extend schemas and types before UI or storage changes.
- Vue uses Composition API + JSX; state via Pinia.
- Background service workers must be DOM‑free; keep message payloads serializable.
- Prefer shared utilities/types in `myz-annotator/src/shared/` over duplicating logic.
- Dashboard uses Vue Router (`myz-annotator/src/dashboard/router.ts`); add new settings sections as routes and sidebar items.
- Highlight records should use shared schemas/types (`MyZRecord`, `RECORD_KINDS`, serializers).

## AGENTS.md upkeep
- When a directory’s structure or responsibilities change, update the nearest `AGENTS.md`.
- Re-scan AGENTS with `rg --files -g 'AGENTS.md'` and keep cross-references current.

## Testing Notes
- myz-annotator Playwright runs against built output; run `npm run build` first.

## Docs & Website
- `docs/knowledges/` is the ground truth for standards and external references.
- `docs/track/` tracks requirements and delivery plans.
- `website/` is user‑facing; keep language friendly and avoid internal file details.
