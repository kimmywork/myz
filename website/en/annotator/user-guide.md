# User Guide (MyZ AI Annotator)

This document explains how to use MyZ AI Annotator’s core highlighting features, the AI Side Panel, and the Dashboard settings.

> Important (AI / network features)
>
> - The extension provides **no remote service**. Any optional network requests are sent **directly from your browser** to third-party services you configure or visit (for example: a custom AI Provider, MCP Servers, S3-compatible storage, X/Mastodon, YouTube).
> - A custom AI Provider can consume a large amount of tokens and incur significant charges. Make sure you understand pricing and accept the cost risk.
> - Encrypted sync is end-to-end encrypted (E2EE): only ciphertext and minimal metadata go to your storage; the sync secret stays local.
> - Be careful with sensitive/private data. Do not send content to third-party servers unless you understand and accept their data-handling policies.

> UI language note
>
> Some menus/buttons in the extension are currently labeled in Chinese. This guide includes the exact labels in backticks so you can find them easily.

## 1. Installation and entry points

- After installing, pin the extension to your browser toolbar.
- **Popup**: click the extension icon for a quick view of highlights on the current page.
- **Dashboard (management & settings)**: in the popup, click the “Open Dashboard” button (Chinese UI: `打开 Dashboard`) to open the options page.
- **Side Panel (AI Assistant)**: used for AI chat based on page context; can be opened from the floating toolbar, right-click menu, or in-page entry points.

## 2. Basic annotation (highlight / underline / wavy underline)

1. Select text on the page.
2. A floating toolbar appears near your selection:
   - `添加标注` (Add annotation): creates a replayable highlight annotation (with color/style).
   - `保存文字` (Save text): saves the selected text as a “text-only” record (no highlight DOM is applied to the page).
   - `截取选区截图` (Capture selection screenshot): captures a screenshot of the selection (the extension temporarily clears the native selection highlight before capturing to avoid blue selection artifacts).
   - `发送到AI助理` (Send to AI Assistant): opens the Side Panel and prepares the selected content as chat context (details in section 5).
3. The extension badge on the toolbar icon shows how many highlights exist on the current page.

## 3. Manage and organize (Popup / Dashboard)

### 3.1 Popup: quick view for the current page

- Shows the highlights/text clips for the current page.
- Provides quick actions such as open details, edit, delete, and jump to Dashboard.

### 3.2 Dashboard: global management & settings

In the Dashboard top navigation, open **Settings** (Chinese UI: `设置`). Main sections include:

- **Import highlights** (Chinese UI: `导入标注`): import a JSON file and choose a conflict strategy (skip/overwrite/keep latest).
- **Social import** (Chinese UI: `社区导入`): import from X (Twitter) / Mastodon via in-browser page scraping (no official API; typically requires you to be logged in; subject to rate limits / policies / layout changes).
- **AI Assistant** (Chinese UI: `AI 智能助理`): configure Providers, model capabilities, conversation models, MCP servers, local tools, and vector search (Vectoria).
- **Agent Skills**: import/enable skills and choose manual or auto selection.
- **Encrypted Sync**: configure S3-compatible storage and a local sync secret.

## 4. Configure the AI Side Panel

AI features require setup in **Dashboard → Settings**. Recommended order:

### 4.1 Enable AI Assistant

- Turn on `启用智能助理` (Enable AI Assistant).

### 4.2 Configure an AI Provider (OpenAI-compatible)

In **Providers**, configure:

- **Base URL**: e.g. `https://api.openai.com/v1` (must be OpenAI-compatible)
- **API Key**: provided by your service
- **Headers (optional)**: one `Key: Value` per line
- **Test connection**: pick a model and run a test; only then you can enable the provider

### 4.3 Configure model capabilities (Capabilities)

Per model, you can enable capabilities that directly control what the UI allows:

- **Vision** (`支持 Vision`): allows sending images/screenshots and enables entries like “Interpret image”
- **Tool Calling** (`支持 Tool Calling`): allows tool usage (MCP / local tools)
- **Reasoning** (`支持 Reasoning`): enables reasoning-related handling (if your model supports it)

You can also configure token limits (Context Window, Max Output Tokens, output parameter).

### 4.4 Configure Agent models (Conversation / Insights)

- **Conversation**: the main Side Panel chat model and temperature
  - Optional: `发送前压缩图片（最长边 ≤ 640px）` (Compress images before sending). Images are downscaled proportionally; if the original is already below 640px, it won’t be resized.
- **Insights**: the model used for auto summary/key points and similar analysis.

### 4.5 Configure MCP Servers (optional)

To connect external tool servers:

- Add an MCP Server URL (and headers if needed)
- Test the connection first, then enable it

### 4.6 Configure Agent Skills (optional)

Agent Skills are reusable instruction bundles that are injected into the prompt before each model call. You can enable them manually or let a selector model pick the best skills per message.

- **Built-in skills**: shipped with the extension, cannot be deleted but can be enabled/disabled.
- **Custom skills**: import via Zip or folder in Dashboard → AI settings → Agent Skills.
- **Explicit invocation**: use `@skill-name` in the input to force a specific skill.
- **Auto mode**: enable `自动` and choose a selector model to pick skills from the enabled list.
- **Editing**: UTF-8 text files (like `SKILL.md`) are editable; binary files are read-only.

::: tip Practical usage
Pack team workflows or response formats into individual skills and reuse them with `@skill-name` or Auto mode.
:::

### 4.7 Configure Local Tools (optional)

Local tools can access extension-local data (for example your saved highlights). Enable only the tools you need to reduce data exposure.

- **Manual**: always expose all enabled local tools
- **Auto** (`自动`): choose a “selector model” that decides (per user message) which subset of enabled tools should be available for that message

Common local tools include: searching your highlights, listing popular tags, web search, and fetching a page’s primary content (useful for reading a search result in detail).

### 4.8 Vector search (Vectoria, optional)

Vectoria finds semantically similar highlights from your history and shows them in the in-page overlay and the Side Panel “Related” view.

- Choose an embeddings model (Provider+Model) and test it
- After enabling, it’s recommended to click `重建索引` (Rebuild index), especially on first setup or when switching models
- Configure **Match threshold (40% - 100%)** (`匹配阈值`) — only matches with score ≥ threshold are shown (default: 50%)

## 5. Encrypted Sync (E2EE Sync)

Encrypted sync uses your own S3-compatible storage; we do not run any online service. Only ciphertext and minimal metadata are stored remotely, and the sync secret stays on your device. The sync secret is derived from the password you enter, and we do not store that password.

Recommended storage: **AWS S3**, **Cloudflare R2**, or any other **S3-compatible** storage provider.

### 5.1 Setup steps

1. Open Dashboard → Settings → **Encrypted Sync** (`加密同步`).
2. Fill in the S3 settings:
   - **Endpoint**: the S3-compatible endpoint URL
   - **Region / Bucket**
   - **Access Key ID / Secret Access Key**
   - **Session Token** (optional)
   - **Prefix** (optional): isolate data across devices/projects
3. Click **Save settings** (`保存设置`), then **Test connection** (`测试连接`).
4. Set the **Sync secret** (`同步密钥`) — it stays local; use a strong passphrase.
5. Enable **Sync** (`启用同步`) and click **Sync now** (`立即同步`) once.

The status panel shows KeyId, Manifest version, last sync time, and key updated time.

::: warning Important
The sync secret cannot be recovered. If you forget the password, new clients cannot decrypt old data; you must re-encrypt and re-sync from scratch.
:::

::: tip Public audit
The E2EE implementation is open for review at <https://github.com/myz-suite/sync/>.
:::

## 6. Use the AI Side Panel

### 6.1 Ways to open the Side Panel

- **Floating toolbar**: select text and click `发送到AI助理`
  - Opens the Side Panel and attaches the selected text as “context” in the input area
  - If the selection contains an image, the extension captures a screenshot of the selection area and attaches it (then applies your image compression setting if enabled)
- **Right-click menu**:
  - Right-click page: `打开AI助理` → `打开面板`
  - Right-click page: `打开AI助理` → `总结页面内容` / `发现关键要点`
  - Right-click image: `打开AI助理` → `解读图片内容` (requires a Vision-enabled Conversation model)

### 6.2 Context shown in the Input Composer

When you open the Side Panel via any of the actions above, the context is shown in the input area “like attachments”, including:

- Selected text context (shown later in the user bubble as `选中内容（上下文）`)
- Attached images/screenshots (removable, previewable)
- Your own prompt text (editable)

Before sending, you can:

- Edit your prompt
- Decide whether to include `页面上下文` (page context) — it is **off by default**
- Remove any context or images you don’t want to send

### 6.3 After sending: display and image preview

- If your message includes text context, the user bubble shows both:
  - your typed prompt
  - the selected context text
- If your message includes images/screenshots:
  - thumbnails appear in the message
  - clicking a thumbnail opens an in-Side-Panel preview (keeps the original aspect ratio)

### 6.4 Conversation threads and history

- Side Panel header:
  - `新对话` (New conversation): starts a new conversation for the current page (keeps your Input Composer draft/attachments)
  - `历史` (History): opens the conversation history list
- Each time the Side Panel is reopened/reloaded, it starts a **new** conversation (to avoid long contexts).
- While the Side Panel stays open, switching browser tabs updates the page title and marks the conversation as cross-page when applicable.

## 7. Related highlights (Vectoria Interests)

When vector search is enabled, the extension monitors what you’re reading and finds similar items from your highlight history:

- An in-page “Related highlights” popup appears with top matches
- Each item shows similarity score and source page metadata
- Clicking `侧边栏查看全部` opens the Side Panel “Related highlights” view with more results

Tips:

- If you see too many or too few results, adjust `匹配阈值` in Dashboard → Settings → Vector search (Vectoria)
- After switching embeddings models, rebuild the index for better results

## 8. Social import (X / Mastodon)

In Dashboard → Settings → Social import (`社区导入`), enter a profile URL and choose what types to import.

How it works:

- The importer opens a new window and scrapes pages in your browser
- Bookmarks/private pages usually require you to be logged in

Risk notes:

- This feature depends on third-party websites and may be affected by policies, anti-abuse controls, rate limits, and layout changes
- You decide whether to enable it and accept the risk of account limitations, access restrictions, failures, or partial results

## 9. Zen Mode

On pages with a detectable article body, you can use the right-click menu:

- `禅定模式 (仅显示文章)` (Zen Mode): keeps only the primary article content for a distraction-free view (designed to be non-destructive to DOM structure so highlight restoration remains stable)
- `保存文章为图片` (Save article as image): available only when Zen Mode is enabled; captures the article body

If you don’t see the menu, the extension couldn’t detect a suitable article container on that page.

## 10. Troubleshooting

### 10.1 AI entries are disabled / missing

- `解读图片内容` is disabled or says “Vision model required”: enable **Vision** for your Conversation model in Dashboard settings
- Tools are not used: enable **Tool Calling**, and configure MCP servers and/or local tools

### 10.2 Vector search shows no results

- Make sure vector search is enabled and the model test succeeded
- Rebuild the index on first enable or after switching models
- Try lowering the match threshold

### 10.3 Social import fails

- Ensure you are logged in (especially for bookmarks/private pages)
- Third-party sites may rate-limit or change layouts; try again later or reduce the import volume
