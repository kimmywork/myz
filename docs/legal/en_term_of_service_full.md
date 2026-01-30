# Terms of Service (Full Version)

**Effective date:** 2026-01-12

These Terms of Service (the “Terms”) govern your installation and use of the following browser extensions (collectively, the “Extensions”):

- **MyZ AI Annotator**
- **MyZ Danmaku Viewer**

By installing, accessing, enabling, or using any of the Extensions, you acknowledge that you have read and understood these Terms and agree to be bound by them. If you do not agree, do not install or use the Extensions.

> Note: This is the full version of the terms and expands the summary in `docs/legal/en_tos.md`. For privacy details, see `docs/legal/en_privacy_policy.md`.

## 1. Definitions

For clarity, the following definitions apply:

- **“We”, “Maintainers”, “Contributors”**: the maintainers and contributors of the MyZ project (not any third-party service provider).
- **“You”, “User”**: the individual using the Extensions or the organization you represent.
- **“Extensions”**: the browser extensions listed above and any updates.
- **“Local Data”**: data stored locally in your browser by the Extensions, including highlights, notes, tags, screenshot metadata, danmaku caches, and settings.
- **“Optional Network Features”**: any feature that initiates network requests when you enable or use it (for example: custom AI Provider, MCP Servers, social import, encrypted sync, and interactions with third-party sites).
- **“Custom AI Provider”**: an OpenAI-compatible API endpoint you configure (Base URL, API key, headers, models).
- **“MCP Server”**: an external tool server you configure (URL, headers) for listing and invoking tools.
- **“Social Import”**: importing content by opening and scraping X (Twitter) or Mastodon pages in your browser (no official API).
- **“Encrypted Sync (E2EE Sync)”**: end-to-end encrypted sync that uses your S3-compatible storage and a local sync secret derived from your password.
- **“Third-Party Services / Sites”**: any service or website not operated or controlled by us (for example: your custom AI Provider, MCP Servers, S3-compatible storage providers, X/Mastodon, YouTube).

## 2. Eligibility

1. You may use the Extensions only if you have the legal capacity to enter into a binding agreement in your jurisdiction.
2. If you use the Extensions on behalf of an organization, you represent that you are authorized to bind that organization and you accept responsibility for the organization’s use.
3. You are responsible for ensuring that your use complies with applicable laws, regulations, organizational policies, and third-party terms.

## 3. License and Intellectual Property

1. We grant you a limited, non-exclusive, revocable license to install and use the Extensions for personal or internal business purposes.
2. Except as permitted by applicable law, you may not:
   - reverse engineer, decompile, or disassemble the Extensions;
   - remove proprietary notices or other rights markers embedded in the Extensions;
   - bypass access controls or security limitations;
   - use the Extensions to violate any law or third-party rights.
3. The Extensions and related names, logos, and materials are owned by their respective rightsholders. These Terms do not transfer ownership to you.

## 4. Acceptable Use and Your Responsibilities

1. You are responsible for all actions performed through the Extensions, including what you highlight, import, export, send to third parties, or otherwise process.
2. You must not use the Extensions in a way that:
   - violates laws or third-party terms;
   - infringes intellectual property, privacy, or other rights;
   - distributes malware or compromises security;
   - attempts to evade rate limits or anti-abuse systems, or otherwise disrupts third-party services.
3. If you use the Extensions in regulated, audited, or enterprise environments, you are responsible for evaluating compliance, data flows, retention/logging, and security controls.

## 5. Local-Only Data Handling (No Remote Service)

1. The Extensions are designed to operate primarily with **local-first storage**. Local Data is stored in your browser storage (for example, `chrome.storage.local`).
2. We operate **no remote service** to receive, store, or process your Local Data. We do not run servers that collect or aggregate your highlights, messages, or caches.
3. You are responsible for safeguarding your device and browser profile, and for backing up or exporting your data if needed.
4. If you enable encrypted sync, only ciphertext and minimal metadata are stored remotely. The sync secret is derived from the password you enter and we do not store that password. If you forget the password, new clients cannot decrypt old data and you must re-encrypt and re-sync.
5. Privacy details (data types, permissions) are described in `docs/legal/en_privacy_policy.md`.

## 6. Optional Network Features and Third-Party Services (Important)

If you enable Optional Network Features, the Extensions will send requests **directly from your browser** to third-party services or sites. We do not operate, control, or monitor those third parties. You are responsible for deciding whether to enable these features and for all consequences.

### 6.1 Custom AI Providers (OpenAI-compatible)

1. You may configure a Custom AI Provider (Base URL, API key, headers, model). Requests are sent directly from your browser to the server you provide.
2. You acknowledge and agree that:
   - your provider may log, retain, or process your data under its own policies and in its own jurisdiction;
   - you are responsible for what you send (including sensitive data, personal data, copyrighted content, or confidential information);
   - a Custom AI Provider may consume a large amount of tokens and incur significant charges, and you are solely responsible for all fees and billing disputes.
3. We make no guarantees about the provider’s availability, output accuracy, compliance, data handling, or pricing.

### 6.2 MCP Servers (External Tool Servers)

1. You may configure MCP Server endpoints and headers. The Extensions may list tools and invoke tool calls by sending requests directly from your browser to those servers.
2. You acknowledge and agree that:
   - an MCP Server may access, process, or return information related to your highlights and page context;
   - security, compliance, logging/retention, and billing are determined by the MCP Server operator;
   - you are responsible for enabling only the tools you intend to expose and for limiting unnecessary data exposure.
3. We are not responsible for tool outputs, correctness, availability, or any resulting loss.

### 6.3 Social Import (X / Mastodon)

1. Social import opens and accesses X (Twitter) and Mastodon pages in your browser and imports content by scraping page content (no official API). You may need to be logged in.
2. You acknowledge and agree that:
   - availability and results may change due to third-party policies, rate limits, anti-abuse controls, or layout changes;
   - enabling this feature may lead to failures, partial results, access restrictions, or account limitations;
   - you are solely responsible for deciding whether to enable it and for any consequences.
3. We are not responsible for social import availability, accuracy, account status, or related disputes.

### 6.4 MyZ Danmaku Viewer (YouTube Private Interfaces)

1. MyZ Danmaku Viewer may use YouTube private interfaces to read public comments and generate danmaku locally.
2. You acknowledge and agree that:
   - these interfaces may change, be rate-limited, or be blocked at any time;
   - you are responsible for any resulting access restrictions, playback failures, or account limitations.

### 6.5 Encrypted Sync (S3-compatible)

1. You may configure S3-compatible storage (endpoint, region, bucket, access key, secret key, etc.) and set a sync secret. Requests are sent directly from your browser to your configured storage.
2. You acknowledge and agree that:
   - the sync secret is derived from the password you enter and we do not store that password; if you forget it, new clients cannot decrypt old data and you must re-encrypt and re-sync;
   - only ciphertext and minimal metadata are stored remotely; the sync implementation is end-to-end encrypted (E2EE) and does not expose plaintext to the storage platform;
   - storage provider security, availability, billing, and compliance are your responsibility; we are not responsible for third-party outages or disputes.
3. The encrypted sync implementation is publicly auditable at <https://github.com/myz-suite/sync/>.

## 7. Third-Party Content and Rights

1. The Extensions allow you to highlight, annotate, export, or reuse content from websites. Such content may be protected by copyright, privacy, contractual terms, or other rights.
2. You are solely responsible for ensuring your use complies with applicable laws, website terms, and third-party rights.
3. If your usage results in claims, disputes, or takedown requests, you are responsible for resolving them.

## 8. Fees

1. We do not charge you for using the Extensions.
2. Third-party services you choose to use (Custom AI Providers, MCP Servers, third-party sites accessed for import) may incur charges or other risks. You are solely responsible for all such costs and consequences.

## 9. Disclaimer of Warranties

TO THE MAXIMUM EXTENT PERMITTED BY LAW:

1. THE EXTENSIONS ARE PROVIDED “AS IS” AND “AS AVAILABLE” WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, ACCURACY, RELIABILITY, AND NON-INFRINGEMENT.
2. WE DO NOT WARRANT THAT THE EXTENSIONS WILL BE UNINTERRUPTED, ERROR-FREE, OR COMPATIBLE WITH ALL WEBSITES OR DEVICES.
3. AI OUTPUTS, TOOL OUTPUTS, AND SCRAPED/IMPORTED RESULTS ARE FOR INFORMATIONAL PURPOSES ONLY AND ARE NOT PROFESSIONAL ADVICE.

## 10. Limitation of Liability

TO THE MAXIMUM EXTENT PERMITTED BY LAW:

1. WE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, REVENUE, DATA, BUSINESS INTERRUPTION, OR REPUTATIONAL HARM.
2. WE ARE NOT LIABLE FOR ANY LOSS ARISING FROM OR RELATED TO OPTIONAL NETWORK FEATURES OR THIRD-PARTY SERVICES, INCLUDING:
   - third-party downtime, rate limits, or interface changes;
   - privacy leaks, billing disputes, compliance issues, or incorrect outputs from Custom AI Providers / MCP Servers;
   - storage outages, data loss, or billing disputes with S3-compatible providers;
   - account limitations or access restrictions caused by social import or YouTube private interface usage.

## 11. Indemnification

You agree to indemnify, defend, and hold harmless the Maintainers and Contributors from and against any claims, liabilities, damages, losses, and expenses (including reasonable attorneys’ fees) arising out of or related to your use of the Extensions, your content, your third-party configurations, or your violation of these Terms.

## 12. Termination

1. You may stop using the Extensions at any time by uninstalling them.
2. We may modify, suspend, or discontinue the Extensions (in whole or in part) at any time without notice.
3. Sections that by their nature should survive termination will survive (including privacy, disclaimers, limitation of liability, and indemnification).

## 13. Changes to These Terms

We may update these Terms from time to time and will update the effective date above. Continued use after changes constitutes acceptance of the updated Terms.

## 14. Severability and Entire Agreement

1. If any provision of these Terms is held invalid or unenforceable, the remaining provisions will remain in full force and effect.
2. These Terms constitute the entire agreement between you and us regarding the Extensions and supersede any prior agreements on the same subject.

## 15. Contact

If you have questions about these Terms, please open an issue on the [project repository](https://github.com/myz-suite/myz-support/issues).
