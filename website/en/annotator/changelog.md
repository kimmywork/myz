# Release Notes

Highlights from recent extension updates.

## v0.3.1 — UX & settings stability

- Fixed the Inspector not appearing after clicking a highlight, and redesigned it as a toolbar-style popover (notes show above; edit closes the panel).
- Replaced the highlight flash with a softer pulse/halo animation for better visibility in dark/paint styles.
- Interests now only appear when vector search is enabled and a model is configured; cleaned up indicators and reduced their footprint.
- Unified new SVG icons in the shared icon library, updating popup/sidepanel/inspector buttons.
- Fixed AiProviderEditor model list mis-selection during reorder; disabling a model now auto-selects the next item for editing.

## v0.3.0 — End-to-end encrypted sync (E2EE)

- Added encrypted sync with S3-compatible storage (bring your own storage configuration).
- The sync secret stays local; only ciphertext and minimal metadata are stored remotely.
- Added sync status and manual sync actions (KeyId, manifest version, last sync time).

## v0.2.0 — Agent Skills

- Introduced Agent Skills:
  - Built-in and custom skills (import via zip/folder).
  - Explicit skill invocation via `@skill-name`.
  - Auto mode that uses a selector model to pick skills per message.
- Added skill management and editor in Dashboard → AI settings.

## v0.1.5 - AI Assistant integration

- Integrated with AI Assistant:
  - Using AI models analyse page,
  - Conversation with AI models using page context,
  - Support customized AI Providers and MCP servers,
  - Discover interests using vector indexes.
- Remove LogSeq sync.
- Integrated with social network - X (Twitter), Mastodon.

## v0.1.4 — Unified icons & SPA fixes
- Replaced all toolbar/popup/dashboard emoji buttons with custom SVG icons for consistent rendering across platforms.
- Restored the marker-style highlight icon and added an underlined “U” icon so the three text styles are instantly recognizable.
- Enlarged and outlined the dashboard settings icon to improve discoverability.
- Fixed a bug where Twitter and other SPAs failed to reapply highlights when navigating internally—the overlay now listens to History API changes.

## v0.1.3 — Vue 3 architecture & resilient highlights
- Migrated the entire extension to Vite + `@crxjs/vite-plugin` + Vue 3/JSX.
- Refactored popup, dashboard, content, and background modules into composable components.
- Redesigned Range serialization so removing old highlights no longer shifts subsequent entries.
- Added overlap detection and Playwright coverage to prevent conflicting highlights.
- Updated the dark-friendly palette and kept export descriptions in sync.
- Hooked into the History API to refresh highlights after SPA navigation.
- Expanded end-to-end tests and unified the iconography.

## v0.1.2 — More highlight styles & text-only saves
- Added a “Save Text” button to store selections as plain clips.
- Popup/dashboard now distinguish highlight types and let you downgrade to text-only entries.
- Three styles—marker, underline, wavy—are all included in exports.
- Improved text-decoration rendering on narrow line-height pages.

## v0.1.1 — Highlight & screenshot upgrades
- Added import capability plus a toolbar badge that shows highlight counts.
- Warn users when entries cannot be located and fixed several stability issues.
- Screenshot capture no longer includes the selection highlight.

## v0.1.0 — Initial release
MyZ Annotator lets you highlight, annotate, capture screenshots, and manage everything locally. Export JSON/Markdown or sync directly to LogSeq.
