# MyZ Annotator Privacy Policy

**Effective date:** 2025-10-24

MyZ Annotator is a browser extension that helps you highlight, annotate, and optionally sync webpage content to your own LogSeq graph. This policy explains what data the extension accesses, how it is used, and the choices you have.

## Data We Store Locally

- Highlighted text, associated notes, tags, colors, and capture metadata
- Extension settings (color palette, view preferences, LogSeq endpoint/page/token)
- Generated screenshots when you choose to download them (images are saved directly to your device and never leave the browser)

All of the above is kept in `chrome.storage.local`, which is scoped to your browser profile. We do not transmit, back up, or otherwise share this information with any external service.

## Optional LogSeq Synchronization

If you enable LogSeq sync, the extension sends the selected highlights and notes to the LogSeq HTTP API endpoint that **you** configure (typically running on `http://127.0.0.1`). This data travels only between your browser and your local LogSeq server. We do not operate any servers, receive any copies, or log these requests.

The sync payload includes:

- Highlight content converted to Markdown
- Metadata such as highlight ID, created timestamp, and optional tags
- Your configured authentication token (if provided) so LogSeq can accept the request

You may disable sync at any time from the extension’s settings panel, which immediately stops all network requests to LogSeq.

## Permissions Explained

- `activeTab` and `tabs`: Used solely when you click the toolbar button to read the current selection, capture the visible area for screenshots, and navigate back to the highlighted section. No browsing history is stored.
- `<all_urls>` content script: Allows the floating toolbar and highlight rendering to appear on any page you choose to annotate. The script reads only the text you select.
- `http://127.0.0.1/*` and `http://localhost/*`: Required so the extension can communicate with your local LogSeq server when sync is enabled.
- `storage`: Required to keep your highlights and settings on-device.

## No Remote Code Execution

All logic ships with the extension package. The extension never loads or executes code from remote sources.

## Your Choices

- Remove highlights, notes, or screenshots at any time via the dashboard UI.
- Disable LogSeq sync whenever you do not want data sent to your local server.
- Uninstall the extension to delete all stored data automatically.

## Changes to This Policy

If we modify how the extension handles data, we will update this document and bump the effective date. We recommend checking the repository release notes for any privacy-related updates.

## Contact

Questions or concerns? Open an issue on the project repository or contact the maintainer at `kenpusney@gmail.com`.
