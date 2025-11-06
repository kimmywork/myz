# MyZ Annotator Privacy Policy

**Effective date:** 2025-11-04

MyZ Annotator is a browser extension that helps you highlight, annotate, optionally archive pages to the Internet Archive, and sync content to your own LogSeq graph. This policy explains what data the extension accesses, how it is used, and the choices you have.

## Data We Store Locally

- Highlighted text, associated notes, tags, colors, and capture metadata
- Extension settings (color palette, view preferences, Internet Archive preferences, LogSeq endpoint/page/token)
- Generated screenshots when you choose to download them (images are saved directly to your device and never leave the browser)
- Internet Archive queue state and history so the extension can retry or display the status of your own save requests

All of the above is kept in `chrome.storage.local`, which is scoped to your browser profile. We do not transmit, back up, or otherwise share this information with any external service. The MyZ Annotator project and maintainers never receive copies of your highlights, queue entries, or settings.

## Optional LogSeq Synchronization

If you enable LogSeq sync, the extension sends the selected highlights and notes to the LogSeq HTTP API endpoint that **you** configure (typically running on `http://127.0.0.1`). This data travels only between your browser and your local LogSeq server. We do not operate any servers, receive any copies, or log these requests.

The sync payload includes:

- Highlight content converted to Markdown
- Metadata such as highlight ID, created timestamp, and optional tags
- Your configured authentication token (if provided) so LogSeq can accept the request

You may disable sync at any time from the extension’s settings panel, which immediately stops all network requests to LogSeq.

## Optional Internet Archive Snapshots

If you enable Internet Archive support, the extension can submit snapshot requests for the current page to `https://web.archive.org`. The data sent is limited to the page URL plus optional credentials (access key/secret) that you supply. Requests go directly from your browser to the Internet Archive; we do not proxy, inspect, or retain any portion of the payload.

What is stored locally:

- A queue of URLs you asked the extension to archive
- The latest status returned by the Internet Archive CDX API and save endpoints
- Timestamps of attempts and any error messages returned by the Internet Archive

Important limitations and risks:

- Submitting a URL to the Internet Archive will expose that URL (and possibly the page contents) to a public service that we do not control.
- Any access keys or secrets are stored only in your browser’s local storage and are sent directly to the Internet Archive when you request a snapshot. We never receive or log these credentials.
- You are solely responsible for verifying that you have the right to archive the content and for complying with the Internet Archive’s terms and policies.

## Permissions Explained

- `activeTab` and `tabs`: Used solely when you click the toolbar button to read the current selection, capture the visible area for screenshots, and navigate back to the highlighted section. No browsing history is stored.
- `<all_urls>` content script: Allows the floating toolbar and highlight rendering to appear on any page you choose to annotate. The script reads only the text you select.
- `https://web.archive.org/*`: Required so the extension can submit snapshot requests and query status information from the Internet Archive when you enable that feature.
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

Questions or concerns? Open an issue on the [project repository](https://github.com/myz-suite/myz-support/issues).

## No Data Collection by Maintainers

MyZ Annotator is a client-side extension. The maintainers operate no backend that receives, aggregates, or analyzes user data. All network requests triggered by the extension go directly from your browser to services that you configure (for example, your local LogSeq instance or the Internet Archive). By using these optional integrations, you acknowledge that you understand the associated privacy implications and accept any risks.
