# Repository Guide

This repo is a multi‑module suite (extensions + website + libraries). Keep changes scoped to the module you are touching and follow the existing patterns there.

## Layout (high level)
- `myz-annotator/` — Chrome MV3 extension (Vue 3 + JSX, Vite). Core folders:
  - `src/background/` service worker logic (no DOM).
  - `src/content/` content scripts + page UI.
  - `src/popup/`, `src/dashboard/`, `src/sidepanel/` UI surfaces.
  - `src/shared/` shared utilities/types.
- `myz-suite-tool/` — `@myz-suite/desktop`, a Tauri desktop app under active rebuild. Keep the app host-thin: minimal frontend/Tauri bootstraps locally, shared dashboard logic should move into reusable workspace packages instead of re-growing app-local placeholders.
- `website/` — VitePress site (user‑facing docs). Content lives in Markdown under `website/annotator/`, `website/danmaku/`, `website/en/`, `website/guide/`.
- `docs/` — internal docs. See `docs/AGENTS.md` for structure (knowledges/track/research/legal/archives).
- `workflow/` — automation workflows and pipelines (e.g., `workflow/video-pipeline`).
  - `workflow/video-pipeline/skills/screen-recording-narrator/scripts/` — command/script templates for the video pipeline.
- `myz-danmaku/` — MV3 extension for danmaku overlay.
- `packages/dashboard-core/` — shared dashboard host contracts (record/settings/theme/sync repositories and host capability presets) for extension, desktop, and mobile-extension adapters.
- `packages/notes-workspace/` — shared notes workspace shell and route composition for records/settings/sync surfaces. Keep host-specific storage and sync implementations outside this package.
- `vectoria/` — client‑side vector search library + demo UI.

## Common Commands
myz-annotator:
- `npm run dev` / `npm run build`
- `npm run lint` / `npm run test:playwright`

website (VitePress):
- `npm run dev` / `npm run build` / `npm run preview`

Other modules: check each module’s `package.json` for scripts.

@myz-suite/desktop:
- `npm run dev` / `npm run build`
- `npm run lint`

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
