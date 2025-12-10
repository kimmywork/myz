# MyZ Annotator & MyZ Danmaku Privacy Policy

**Effective date:** 2025-11-04

MyZ Annotator helps you highlight, annotate, optionally archive pages to the Internet Archive, and sync content to your own LogSeq graph. MyZ Danmaku fetches timestamped YouTube comments and renders an on-device floating danmaku layer. This policy explains what data these extensions access, how it is used, and the choices you have.

## Data We Store Locally

- Highlighted text, associated notes, tags, colors, and capture metadata
- Extension settings (color palette, view preferences, Internet Archive preferences, LogSeq endpoint/page/token, YouTube caption style)
- Generated screenshots when you choose to download them (images are saved directly to your device and never leave the browser)
- Internet Archive queue state and history so the extension can retry or display the status of your own save requests
- For MyZ Danmaku: parsed comment details (author, timestamp, like count, text) kept locally so the danmaku overlay can work offline

All of the above is kept in browser-local storage that is scoped to your profile. We do not transmit, back up, or otherwise share this information with any external service. The MyZ Annotator / MyZ Danmaku project and maintainers never receive copies of your highlights, danmaku caches, queue entries, or settings.

### Notes Specific to MyZ Danmaku

- The extension uses YouTube’s private interfaces to read public comments for the current video so it can detect timestamps. Requests are sent directly from your browser; we do not proxy, inspect, or store responses.
- Parsed danmaku results and related metadata remain inside your browser for offline reuse. They are not uploaded or synced anywhere.
- We do not collect your viewing history or account information. Danmaku parsing runs entirely on your device.

## Optional LogSeq Synchronization

If you enable LogSeq sync, the extension sends the selected highlights and notes to the LogSeq HTTP API endpoint that **you** configure (typically running on `http://127.0.0.1`). This data travels only between your browser and your local LogSeq server. We do not operate any servers, receive any copies, or log these requests.

The sync payload includes:

- Highlight content converted to Markdown
- Metadata such as highlight ID, created timestamp, and optional tags
- Your configured authentication token (if provided) so LogSeq can accept the request

You may disable sync at any time from the extension’s settings panel, which immediately stops all network requests to LogSeq.

## Optional Internet Archive Snapshots

If you enable Internet Archive support, the extension can submit snapshot requests for the current page to `https://web.archive.org`. The data sent is limited to the page URL plus optional credentials (access key/secret) that you supply. Requests go directly from your browser to the Internet Archive; we do not proxy, inspect, or retain any portion of the payload.

For MyZ Danmaku, calling YouTube’s private interface relies on an unofficial channel. Google may rate-limit or block accounts or IPs that issue these requests frequently. If that happens, you are responsible for any access restrictions or playback issues that arise. We cannot compensate or mediate with Google.

What is stored locally:

- A queue of URLs you asked the extension to archive
- The latest status returned by the Internet Archive CDX API and save endpoints
- Timestamps of attempts and any error messages returned by the Internet Archive

Important limitations and risks:

- Submitting a URL to the Internet Archive will expose that URL (and possibly the page contents) to a public service that we do not control.
- Any access keys or secrets are stored only in your browser’s local storage and are sent directly to the Internet Archive when you request a snapshot. We never receive or log these credentials.
- You are solely responsible for verifying that you have the right to archive the content and for complying with the Internet Archive’s terms and policies.

## Permissions Explained

- `activeTab` and `tabs`: MyZ Annotator reads the current selection and captures screenshots; MyZ Danmaku identifies which YouTube video is playing.
- `<all_urls>` content script: MyZ Annotator uses this to render the toolbar and highlights; MyZ Danmaku runs only on YouTube pages to display the danmaku overlay.
- `https://web.archive.org/*`: Required so the extension can submit snapshot requests and query status information from the Internet Archive when you enable that feature.
- YouTube page access: Lets MyZ Danmaku read public comments for the active video so it can produce danmaku locally.
- `storage`: Required to keep your highlights, danmaku caches, and settings on-device.
- `scripting`: Used by MyZ Danmaku to add the overlay UI and styles on the page.

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
