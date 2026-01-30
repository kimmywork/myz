# Installation Guide

Choose your browser and install MyZ Annotator from the respective store:

- Chrome Web Store: <https://chromewebstore.google.com/detail/myz-annotator/mhakfcbobhdemicjelhjjpmgibhnnplg>
- Microsoft Edge Add-ons: <https://microsoftedge.microsoft.com/addons/detail/myz-annotator/fepakkoggnancnpcclldodfbpgobkabj>

You can also click “Install on Chrome” or “Install on Edge” on the homepage to jump directly to the correct listing.

## Get started

1. Pin the extension icon to the toolbar so you can open it quickly.
2. Select any text on the page—the floating toolbar appears next to your selection so you can highlight, underline, add wavy lines, or 📸 capture a screenshot.
3. The badge on the toolbar icon shows how many highlights exist on the current page.
4. Open the popup or dashboard to manage highlights: search, filter by tag, import/export, and downgrade entries to plain text when needed.

## Dashboard Settings (feature configuration)

In the Dashboard top navigation, click **Settings** to configure:

### Import highlights

- **JSON file**: import a previously exported JSON file (or shared data from others)
- **Conflict strategy**:
  - **Skip duplicates**
  - **Overwrite duplicates**
  - **Keep the latest**

### Social import

This importer opens pages in your browser and scrapes content (no official API required). Bookmark pages are private—make sure you’re logged in.

- **Twitter / X**: enter your profile URL, choose what to import (posts/replies/likes/bookmarks), and set a per-kind limit
- **Mastodon**: enter your profile URL, choose what to import (posts/replies/boosts/favorites/bookmarks), and set a per-kind limit

### AI Assistant

> Notes: AI providers use an **OpenAI-compatible API**. After configuration, you can chat with your model in the Side Panel and enable images/tools/vector search based on the model’s capabilities.

#### 1) Enable AI Assistant

- Turn this on to enable all AI-related settings below

#### 2) Providers

- **Base URL**: e.g. `https://api.openai.com/v1`
- **API Key**: e.g. `sk-...`
- **Headers (optional)**: one `Key: Value` per line (custom auth/routing headers)
- **Test connection**: select a model and test; a provider can only be enabled after a successful test
- **Models**:
  - refresh from `{Base URL}/models`, or add model names manually (e.g. `gpt-4o-mini`)
  - only **enabled** models are available for Agent selection
  - per-model capabilities and token limits:
    - **Vision**: allow image attachments in chat
    - **Tool Calling**: allow MCP/local tools usage
    - **Reasoning**: enable/handle reasoning-related capability (if the model supports it)
    - **Context Window / Max Output Tokens / Output parameter**: control token behavior

#### 3) Agent model routing

- **Conversation**: the main Side Panel chat model and temperature
  - **Compress images before sending (max side ≤ 640px)**: downscale proportionally (no compression if already smaller)
- **Insights**: the model used for auto-summary/key-points and similar analysis

#### 4) MCP servers

Connect external tool servers. You must **test** before you can enable.

- **URL**: MCP server endpoint
- **Headers (optional)**: request headers, one per line (e.g. `Authorization: Bearer ...`)

#### 5) Local tools

Local tools can access extension data (e.g. your saved highlights). Enable only what you need to avoid exposing unnecessary information to the model.

- **Manual**: always expose all enabled local tools to the conversation model
- **Auto**: choose a “selector model” that decides (per user message) which subset of enabled tools should be available for that message

#### 6) Vector search (Vectoria)

Use embeddings to find semantically similar highlights and show them in the in-page overlay / Side Panel “Related” view.

- **Model**: choose a Provider+Model for embeddings
- **Test connection**: required before enabling
- **Enable**
- **Match threshold (40% - 100%)**: only show matches with score above the threshold (default: **50%**)
- **Rebuild index**: recommended after first enable or when switching models (re-indexes your existing highlights)

#### 7) Agent Skills (optional)

Agent Skills are reusable instruction/workflow bundles injected into prompts before each model call.

- **Import**: Zip or folder (Dashboard → AI settings → Agent Skills)
- **Enablement**: manual toggle or Auto mode with a selector model
- **Explicit invocation**: use `@skill-name` in the input to force a skill

### Encrypted Sync (E2EE)

Encrypted sync uses your own S3-compatible storage; we do not run any online service. Only ciphertext and minimal metadata are stored remotely. The sync secret is derived from the password you enter, and we do not store that password.

- Recommended: **AWS S3**, **Cloudflare R2**, or any other **S3-compatible** provider.
- Fill Endpoint / Region / Bucket / Access Key / Secret Key (Session Token and Prefix are optional).
- Save settings, test the connection, then set the sync secret and enable sync.

::: warning
The sync secret stays local and cannot be recovered. If you forget the password, new clients cannot decrypt old data and you must re-encrypt and re-sync.
:::

## FAQ highlights

- **How do I export to Markdown?** Use the detail panel or the dashboard’s “Copy Markdown” action.
- **What if the page is an SPA and navigation resets my highlights?** The extension monitors URL changes and replays highlights. If locating fails, the popup and dashboard will flag the entry so you can downgrade it.
- **AI / vector search shows no results?**
  - Configure a Provider, enable the target model, and select models for Conversation / Vectoria under **Settings → AI Assistant**
  - After enabling vector search or switching models, click **Rebuild index**
