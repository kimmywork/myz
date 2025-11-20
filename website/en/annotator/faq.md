# Frequently Asked Questions

## I installed the extension but the toolbar never shows up. Why?
Select some text on the page. The floating toolbar appears near the selection. If it still does not show, reload the extension from `chrome://extensions/` and try again.

## Will I lose my highlights?
All data lives in `chrome.storage.local`. Revisiting the same URL restores highlights automatically. If the DOM changes too much and the entry cannot be located, the extension prompts you to downgrade it to plain text so nothing is lost.

## Why do some snippets fail to highlight?
Modern sites often use nested or hidden elements that are difficult to manipulate. Try selecting slightly less text (leave out a couple of characters at the start or end) and the toolbar should appear. If the issue persists, [open an issue](https://github.com/myz-suite/myz-support/issues) with the URL so we can investigate.

## How do I import/export?
Use the dashboard’s top menu to export JSON or Markdown. Imports support “skip / overwrite / keep latest” strategies and display a summary when they finish.

## How do I report a bug?
[Open an issue](https://github.com/myz-suite/myz-support/issues) and include your browser version, page URL, reproduction steps, and screenshots if possible.
