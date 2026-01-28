# MyZ AI Annotator & MyZ Danmaku Viewer Privacy Policy

**Effective date:** 2026-01-12

MyZ AI Annotator helps you highlight and annotate in your browser, and (optionally) enables AI chat, tool calling, and vector search. MyZ Danmaku Viewer fetches timestamped YouTube comments and renders an on-device floating danmaku layer. This policy explains what data these extensions access, how it is used, and the choices you have.

## Data We Store Locally

- Highlighted text, associated notes, tags, colors, and capture metadata
- Extension settings (color palette, view preferences, AI Provider configuration, model capabilities/limits, MCP server configuration, local tools toggles, vector search settings, social import settings, YouTube caption style)
- Generated screenshots when you choose to download them (images are saved directly to your device and never leave the browser)
- For MyZ Danmaku Viewer: parsed comment details (author, timestamp, like count, text) kept locally so the danmaku overlay can work offline

All of the above is kept in browser-local storage that is scoped to your profile. We do not transmit, back up, or otherwise share this information with any external service. The MyZ AI Annotator / MyZ Danmaku Viewer project and maintainers never receive copies of your highlights, danmaku caches, or settings.

### Notes Specific to MyZ Danmaku Viewer

- The extension uses YouTube’s private interfaces to read public comments for the current video so it can detect timestamps. Requests are sent directly from your browser; we do not proxy, inspect, or store responses.
- Parsed danmaku results and related metadata remain inside your browser for offline reuse. They are not uploaded or synced anywhere.
- We do not collect your viewing history or account information. Danmaku parsing runs entirely on your device.

## Optional AI Providers and MCP Servers

If you enable AI features, you may configure:

- **Custom AI Providers** (OpenAI-compatible Base URL / API key / headers / models)
- **MCP Servers** (external tool servers)

When enabled, the extension sends requests **directly from your browser** to the servers you configure. The data you choose to send may include your prompt, optional page context, attached images/screenshots, and tool-call parameters.

Important notes:

- We operate **no remote service** to receive, store, or process your AI requests. All network traffic goes directly to the third-party servers you configure.
- Your custom AI Provider / MCP Server may log, retain, or process your data per their own policies. You must evaluate the privacy and security implications yourself.
- A custom AI Provider may consume a large amount of tokens and incur significant charges. You are solely responsible for understanding pricing and paying any fees.
- Do not send sensitive or private data to third-party servers unless you fully understand and accept their data-handling practices.

## Optional Social Import (X / Mastodon)

If you enable social import, the extension will open and access relevant pages on X (Twitter) and Mastodon in your browser and import content by scraping the page (no official API).

Important notes:

- Availability, scope, and quality can change due to third-party site policies, anti-abuse controls, and layout changes.
- You are responsible for deciding whether to enable this feature and for any consequences (including account limitations, access restrictions, partial results, or failures).
- We operate **no remote service**. Scraping/import runs directly between your browser and the third-party sites, and imported results are stored only in your local browser storage.

For MyZ Danmaku Viewer, calling YouTube’s private interface relies on an unofficial channel. Google may rate-limit or block accounts or IPs that issue these requests frequently. If that happens, you are responsible for any access restrictions or playback issues that arise. We cannot compensate or mediate with Google.

## Permissions Explained

- `activeTab` and `tabs`: MyZ AI Annotator reads the current selection and captures screenshots; MyZ Danmaku Viewer identifies which YouTube video is playing.
- `<all_urls>` content script: MyZ AI Annotator uses this to render the toolbar and highlights; MyZ Danmaku Viewer runs only on YouTube pages to display the danmaku overlay.
- YouTube page access: Lets MyZ Danmaku read public comments for the active video so it can produce danmaku locally.
- `storage`: Required to keep your highlights, danmaku caches, and settings on-device.
- `scripting`: Used by MyZ Danmaku to add the overlay UI and styles on the page.

## No Remote Code Execution

All logic ships with the extension package. The extension never loads or executes code from remote sources.

## Your Choices

- Remove highlights, notes, or screenshots at any time via the dashboard UI.
- Disable AI features / MCP tools / social import whenever you do not want data sent to your configured servers or third-party sites.
- Uninstall the extension to delete all stored data automatically.

## Changes to This Policy

If we modify how the extension handles data, we will update this document and bump the effective date. We recommend checking the repository release notes for any privacy-related updates.

## Contact

Questions or concerns? Open an issue on the [project repository](https://github.com/myz-suite/myz-support/issues).

## No Data Collection by Maintainers

MyZ AI Annotator is a client-side extension. The maintainers operate no backend that receives, aggregates, or analyzes user data. All network requests triggered by the extension go directly from your browser to services that you configure or access (for example, your custom AI Provider, your MCP server, or YouTube). By using these optional network features, you acknowledge that you understand the associated privacy implications and accept any risks and costs.
