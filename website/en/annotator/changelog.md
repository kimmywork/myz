# Release Notes

Highlights from recent extension updates.

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
