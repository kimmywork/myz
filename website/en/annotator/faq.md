# Frequently Asked Questions

## I installed the extension but the toolbar never shows up. Why?
Select some text on the page. The floating toolbar appears near the selection. If it still does not show, reload the extension from `chrome://extensions/` and try again.

## Will I lose my highlights?
All data lives in `chrome.storage.local`. Revisiting the same URL restores highlights automatically. If the DOM changes too much and the entry cannot be located, the extension prompts you to downgrade it to plain text so nothing is lost.

## Why do some snippets fail to highlight?
Modern sites often use nested or hidden elements that are difficult to manipulate. Try selecting slightly less text (leave out a couple of characters at the start or end) and the toolbar should appear. If the issue persists, [open an issue](https://github.com/myz-suite/myz-support/issues) with the URL so we can investigate.

## How do I import/export?
Use the dashboard’s top menu to export JSON or Markdown. Imports support “skip / overwrite / keep latest” strategies and display a summary when they finish.

## What are Agent Skills and how do I use them?
Agent Skills are reusable instruction/workflow bundles injected before each model call. Import skills in Dashboard → Settings → AI Assistant → Agent Skills, or invoke a skill explicitly with `@skill-name` in the input.

## Is sync safe? Do I need your service?
Sync is end-to-end encrypted (E2EE). Only ciphertext and minimal metadata are stored in your own S3-compatible storage (AWS S3, Cloudflare R2, or other compatible providers). The sync secret is derived from the password you enter and we do not store that password; if you forget it, new clients cannot decrypt old data and you must re-encrypt and re-sync. We do not operate any online service and never see your plaintext data.

## How do I report a bug?
[Open an issue](https://github.com/myz-suite/myz-support/issues) and include your browser version, page URL, reproduction steps, and screenshots if possible.
