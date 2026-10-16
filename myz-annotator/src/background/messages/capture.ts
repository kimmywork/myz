import { registerMessageHandler } from "./handler";

export interface CaptureSelectionMessageResult {
  dataUrl: string;
}

export interface FetchAssetMessageResult {
  dataUrl: string;
  mime: string;
}

/** Only these schemes may be fetched on behalf of a content script. */
const FETCHABLE_SCHEMES = new Set(["http:", "https:", "data:", "blob:"]);

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

/**
 * Fetch an image resource into a base64 data URL. Runs in the service worker so
 * host permissions bypass the page's CORS restrictions (content-script fetches
 * cannot). Scheme-checked to avoid turning it into a local-file reader.
 */
async function fetchAssetAsDataUrl(
  url: string,
): Promise<FetchAssetMessageResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid asset URL");
  }
  if (!FETCHABLE_SCHEMES.has(parsed.protocol)) {
    throw new Error("Unsupported asset scheme");
  }
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Fetch failed with status ${response.status}`);
  }
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) {
    throw new Error("Resource is not an image");
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return {
    dataUrl: `data:${blob.type};base64,${bytesToBase64(bytes)}`,
    mime: blob.type,
  };
}

export function initializeCaptureMessageHandlers() {
  registerMessageHandler(
    "myz:captureSelection",
    async (
      payload: { format?: "jpeg" | "png"; quality?: number },
      sender: chrome.runtime.MessageSender,
    ) => {
      if (!sender?.tab || typeof sender.tab.windowId === "undefined") {
        throw new Error("No active tab for capture");
      }
      const format = payload?.format === "jpeg" ? "jpeg" : "png";
      const quality =
        typeof payload?.quality === "number" ? payload.quality : undefined;
      const dataUrl = await chrome.tabs.captureVisibleTab(sender.tab.windowId, {
        format,
        quality,
      });
      return { dataUrl };
    },
  );

  registerMessageHandler(
    "myz:fetchAsset",
    async (payload: { url?: string } | undefined) => {
      if (!payload?.url) {
        throw new Error("Missing asset URL");
      }
      return fetchAssetAsDataUrl(payload.url);
    },
  );
}
