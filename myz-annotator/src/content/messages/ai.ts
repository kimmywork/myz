import { registerMessageHandler } from "./handler";
import {
  AIContextOptions,
  captureAiPageContext,
  clearAiPageChunkAnchors,
  scrollToAiChunk,
  extractPageContentForAi,
} from "../ai-page-context";
import { findPrimaryContentElement } from "../content-extraction.js";
import { serializeRangeToHtml } from "../html.js";
import {
  applyHighlight,
  deleteUnreachableHighlights,
  getHighlightCache,
  markHighlightForReapply,
  removeHighlightFromPending,
  storeRecord,
  updateHighlightIndicators,
} from "../highlight-state";
import { useModalStore } from "../stores/modal-store";
import { useNotificationStore } from "../stores/notification-store";
import { usePreferenceStore } from "../stores/preference-store";
import { sendMessage } from "@/shared/messaging.js";
import { normalizeColor, normalizeWhitespace } from "@/shared/highlightUtils.js";
import { serializeRange, isNodeFromMyz } from "@/shared/serializer.js";
import {
  AUTO_HIGHLIGHT_CATEGORIES,
  DEFAULT_COLORS,
  DEFAULT_HIGHLIGHT_STYLE,
  HIGHLIGHT_STYLES,
  RECORD_KINDS,
} from "@/shared/types.js";
import { canonicalUrl, extractHostname } from "@/shared/url.js";

const TEXT_TAG_BLACKLIST = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);
const TRAILING_PUNCTUATION = /[。！？!?…，,；;：:、．.]+$/g;
const PUNCTUATION_REGEX = /[\p{P}\p{S}]/u;
const STYLE_OPTIONS = Object.values(HIGHLIGHT_STYLES);
const CATEGORY_OPTIONS = Object.values(AUTO_HIGHLIGHT_CATEGORIES);
const DEFAULT_CATEGORY_STYLES = {
  conceptual: {
    style: HIGHLIGHT_STYLES.PAINT,
    color: DEFAULT_COLORS[0],
  },
  structural: {
    style: HIGHLIGHT_STYLES.UNDERLINE,
    color: DEFAULT_COLORS[3] || DEFAULT_COLORS[0],
  },
  behavioural: {
    style: HIGHLIGHT_STYLES.WAVY,
    color: DEFAULT_COLORS[1] || DEFAULT_COLORS[0],
  },
};

type TextPosition = {
  node: Text;
  offset: number;
};

function resolvePreferenceValue<T>(value: any, fallback: T): T {
  if (value && typeof value === "object" && "value" in value) {
    return (value as any).value ?? fallback;
  }
  return (value as T) ?? fallback;
}

function resolveStyle(value: any, fallback: HIGHLIGHT_STYLES) {
  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  if (STYLE_OPTIONS.includes(normalized as HIGHLIGHT_STYLES)) {
    return normalized as HIGHLIGHT_STYLES;
  }
  return fallback;
}

function resolveColor(value: any, fallback: string) {
  const normalized = normalizeColor(
    typeof value === "string" ? value : "",
    fallback,
  );
  return normalized || fallback;
}

function resolveCategory(value: any) {
  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  if (CATEGORY_OPTIONS.includes(normalized as AUTO_HIGHLIGHT_CATEGORIES)) {
    return normalized as AUTO_HIGHLIGHT_CATEGORIES;
  }
  return AUTO_HIGHLIGHT_CATEGORIES.CONCEPTUAL;
}

function normalizeCategoryStyles(
  value: any,
  fallback = DEFAULT_CATEGORY_STYLES,
) {
  const raw = value || {};
  return {
    conceptual: {
      style: resolveStyle(raw.conceptual?.style, fallback.conceptual.style),
      color: resolveColor(raw.conceptual?.color, fallback.conceptual.color),
    },
    structural: {
      style: resolveStyle(raw.structural?.style, fallback.structural.style),
      color: resolveColor(raw.structural?.color, fallback.structural.color),
    },
    behavioural: {
      style: resolveStyle(raw.behavioural?.style, fallback.behavioural.style),
      color: resolveColor(raw.behavioural?.color, fallback.behavioural.color),
    },
  };
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildPunctuationWildcardPattern(value: string) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return "";
  let pattern = "";
  let inCode = false;
  let lastWasWildcard = false;
  for (const ch of normalized) {
    if (ch === "`") {
      inCode = !inCode;
      continue;
    }
    if (ch === " ") {
      pattern += "\\s+";
      lastWasWildcard = false;
      continue;
    }
    if (!inCode && PUNCTUATION_REGEX.test(ch)) {
      if (!lastWasWildcard) {
        pattern += "[\\p{P}\\p{S}]*\\s*";
        lastWasWildcard = true;
      }
      continue;
    }
    pattern += escapeRegex(ch);
    lastWasWildcard = false;
  }
  return pattern;
}

function matchesWithPunctuationWildcard(snippet: string, target: string) {
  const pattern = buildPunctuationWildcardPattern(snippet);
  if (!pattern) return false;
  const regex = new RegExp(`^${pattern}$`, "u");
  return regex.test(target);
}

function stripTrailingPunctuation(value: string) {
  const trimmed = normalizeWhitespace(value);
  const stripped = trimmed.replace(TRAILING_PUNCTUATION, "").trim();
  return { stripped, removed: stripped !== trimmed };
}

function shouldIncludeTextNode(node: Text): boolean {
  if (!node || !node.textContent) return false;
  if (!node.textContent.trim()) return false;
  if (isNodeFromMyz(node)) return false;
  const parent = node.parentElement;
  if (!parent) return false;
  if (TEXT_TAG_BLACKLIST.has(parent.tagName)) return false;
  return true;
}

function buildNormalizedTextMap(root: Element, maxChars = 60000) {
  const pieces: string[] = [];
  const positions: TextPosition[] = [];
  let lastWasSpace = false;
  let truncated = false;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return shouldIncludeTextNode(node as Text)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  const max = Math.max(1000, Math.min(120000, Math.floor(maxChars || 60000)));
  let current: Text | null = walker.nextNode() as Text | null;
  while (current) {
    const value = current.textContent || "";
    for (let index = 0; index < value.length; index += 1) {
      const ch = value[index];
      const isSpace = /\s/.test(ch);
      if (isSpace) {
        if (!pieces.length || lastWasSpace) {
          continue;
        }
        pieces.push(" ");
        positions.push({ node: current, offset: index });
        lastWasSpace = true;
      } else {
        pieces.push(ch);
        positions.push({ node: current, offset: index });
        lastWasSpace = false;
      }
      if (pieces.length >= max) {
        truncated = true;
        break;
      }
    }
    if (truncated) break;
    current = walker.nextNode() as Text | null;
  }

  if (pieces.length && pieces[pieces.length - 1] === " ") {
    pieces.pop();
    positions.pop();
  }

  return {
    text: pieces.join(""),
    positions,
    truncated,
  };
}

function createRangeFromIndexes(
  start: number,
  end: number,
  positions: TextPosition[],
) {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const safeStart = Math.max(0, Math.min(positions.length, Math.floor(start)));
  const safeEnd = Math.max(0, Math.min(positions.length, Math.floor(end)));
  if (safeEnd <= safeStart || safeEnd > positions.length) return null;
  const startPos = positions[safeStart];
  const endPos = positions[safeEnd - 1];
  if (!startPos || !endPos) return null;
  const range = document.createRange();
  range.setStart(startPos.node, Math.min(startPos.offset, startPos.node.length));
  const endOffset = Math.min(endPos.offset + 1, endPos.node.length);
  range.setEnd(endPos.node, endOffset);
  if (range.collapsed) return null;
  return range;
}

function rangeOverlapsExistingHighlight(range: Range) {
  try {
    const existing = Array.from(document.querySelectorAll(".myz-highlight"));
    for (const el of existing) {
      try {
        if (range.intersectsNode(el)) {
          return true;
        }
      } catch {
        // ignore intersect errors
      }
    }
  } catch {
    // ignore query errors
  }
  return false;
}

export function initializeAiMessageHandlers() {
  registerMessageHandler("myz:captureAiPageContext", async (payload: AIContextOptions) => {
    return captureAiPageContext(payload || {});
  });

  registerMessageHandler("myz:scrollToAiChunk", async (payload: { chunkId: string; snippet?: string }) => {
    const chunkId = payload?.chunkId;
    const snippet = payload?.snippet || "";
    const success = scrollToAiChunk(chunkId, snippet);
    if (!success) {
        throw new Error("Chunk not found");
    }
    return { success };
  });

  registerMessageHandler("myz:clearAiPageChunks", async () => {
    clearAiPageChunkAnchors();
  });

  registerMessageHandler("myz:extractPageContent", async () => {
    return extractPageContentForAi();
  });

  registerMessageHandler(
    "myz:extractPrimaryContent",
    async (payload: { maxChars?: number }) => {
      const requested = Number(payload?.maxChars);
      const maxTotalChars =
        Number.isFinite(requested) && requested > 0
          ? Math.min(60000, Math.max(1000, Math.floor(requested)))
          : 15000;

      const result = captureAiPageContext({
        maxTotalChars,
        registerAnchors: false,
      });

      const text = result.chunks.map((c) => c.text).join("\n\n");

      return {
        title: result.title,
        url: result.url,
        text,
        truncated: Boolean(result.truncated),
        chunkCount: result.chunkCount,
        wordCount: result.wordCount,
      };
    },
  );

  registerMessageHandler(
    "myz:runAutoHighlight",
    async (payload: {
      maxChars?: number;
      maxHighlights?: number;
      temperature?: number;
    }) => {
      const notificationStore = useNotificationStore();
      const modalStore = useModalStore();
      const preferenceStore = usePreferenceStore();
      try {
        const requested = Number(payload?.maxChars);
        const maxChars =
          Number.isFinite(requested) && requested > 0
            ? Math.min(120000, Math.max(4000, Math.floor(requested)))
            : 60000;

        const root = findPrimaryContentElement() || document.body;
        if (!root) {
          throw new Error("无法定位页面主体内容");
        }

        const { text, positions, truncated } = buildNormalizedTextMap(
          root,
          maxChars,
        );
        if (!text || text.length < 200) {
          throw new Error("页面内容不足，无法生成标注");
        }

        notificationStore.notify({
          message: "AI 正在生成标注...",
          duration: 2000,
        });

        const result: any = await sendMessage("myz:generateAutoHighlights", {
          text,
          title: document.title || "",
          url: window.location.href,
          temperature: payload?.temperature,
        });

        const highlights = Array.isArray(result?.highlights)
          ? result.highlights
          : [];
        if (!highlights.length) {
          notificationStore.notify({ message: "未生成可用标注" });
          return { success: false, count: 0 };
        }

        const normalizeTag = (tag: any) =>
          typeof tag === "string" ? tag.replace(/^#+/, "").trim() : "";

        const currentUrl = window.location.href;
        const canonical = canonicalUrl(currentUrl);
        const hostname = extractHostname(currentUrl);
        const color = resolvePreferenceValue(
          preferenceStore.lastUsedColor,
          DEFAULT_COLORS[0],
        );
        const style = resolvePreferenceValue(
          preferenceStore.lastUsedStyle,
          DEFAULT_HIGHLIGHT_STYLE,
        );
        const categoryStyles = normalizeCategoryStyles(result?.categoryStyles);

        const prepared: Array<any> = [];
        const seenRanges = new Set<string>();
        const occupied: Array<{ start: number; end: number }> = [];

        highlights.forEach((item: any) => {
          if (!item?.text || typeof item.text !== "string") return;
          const normalizedSnippet = normalizeWhitespace(item.text);
          if (!normalizedSnippet) return;

          const start = Number(item?.start);
          const end = Number(item?.end);
          if (!Number.isFinite(start) || !Number.isFinite(end)) return;
          const safeStart = Math.max(0, Math.min(text.length, Math.floor(start)));
          const safeEnd = Math.max(0, Math.min(text.length, Math.floor(end)));
          if (safeEnd <= safeStart) return;

          const substring = text.slice(safeStart, safeEnd);
          const normalizedSubstring = normalizeWhitespace(substring);
          let matches = normalizedSubstring === normalizedSnippet;
          if (!matches) {
            const relaxed = stripTrailingPunctuation(normalizedSnippet);
            if (relaxed.removed && relaxed.stripped) {
              matches = normalizedSubstring === relaxed.stripped;
            }
          }
          if (!matches) {
            matches = matchesWithPunctuationWildcard(
              normalizedSnippet,
              normalizedSubstring,
            );
          }
          if (!matches) {
            return;
          }

          const startResolved = safeStart;
          const endResolved = safeEnd;

          const key = `${startResolved}:${endResolved}`;
          if (seenRanges.has(key)) return;
          seenRanges.add(key);
          if (
            occupied.some(
              (range) => startResolved < range.end && endResolved > range.start,
            )
          ) {
            return;
          }

          const range = createRangeFromIndexes(startResolved, endResolved, positions);
          if (!range) return;
          if (rangeOverlapsExistingHighlight(range)) return;

          const extracted = normalizeWhitespace(range.toString());
          if (!extracted) return;

          const serializedRange = serializeRange(
            range,
            getHighlightCache(),
            applyHighlight,
          );
          if (!serializedRange) return;

          occupied.push({ start: startResolved, end: endResolved });

          const tags = Array.from(
            new Set([
              ...(Array.isArray(item?.tags) ? item.tags.map(normalizeTag) : []),
              "AI生成标注",
            ]),
          ).filter(Boolean);

          const category = resolveCategory(item?.category);
          const categoryStyle = categoryStyles[category];
          const itemColor = categoryStyle?.color || color;
          const itemStyle = categoryStyle?.style || style;

          prepared.push({
            url: canonical,
            sourceUrl: currentUrl,
            title: document.title || "",
            text: extracted || substring,
            html: serializeRangeToHtml(range),
            note: "",
            tags,
            hostname,
            kind: RECORD_KINDS.HIGHLIGHT,
            color: itemColor,
            style: itemStyle,
            range: serializedRange,
          });
        });

        if (!prepared.length) {
          notificationStore.notify({ message: "未生成可用标注" });
          return { success: false, count: 0 };
        }

        let successCount = 0;
        for (const payloadItem of prepared) {
          const record = await sendMessage("myz:saveHighlight", payloadItem);
          if (!record) continue;
          const stored = storeRecord(record);
          if (stored) {
            const applied = applyHighlight(stored);
            if (applied) {
              deleteUnreachableHighlights(stored.id);
              removeHighlightFromPending(stored.id);
            } else {
              markHighlightForReapply(stored.id);
            }
            modalStore.addModalKnownTags(stored.tags || payloadItem.tags || []);
            updateHighlightIndicators();
            successCount += 1;
          }
        }

        const suffix = truncated ? "（内容已截断）" : "";
        if (successCount > 0) {
          notificationStore.notify({
            message: `已生成 ${successCount} 条标注${suffix}`,
          });
        } else {
          notificationStore.notify({ message: "未生成可用标注" });
        }
        return { success: successCount > 0, count: successCount, truncated };
      } catch (error) {
        notificationStore.notify({
          message: `AI 标注失败：${(error as Error).message}`,
        });
        return { success: false, count: 0 };
      }
    },
  );

  registerMessageHandler(
    "myz:analyzePage",
    async (payload: { action?: string; contextOptions?: AIContextOptions }) => {
      const action = payload?.action === "key_points" ? "key_points" : "summarize";
      const context = captureAiPageContext({
        maxTotalChars: 80000,
        ...(payload?.contextOptions || {}),
        registerAnchors: true,
      });

      const insights: any = await sendMessage("myz:generatePageInsights", {
        action,
        title: context.title,
        url: context.url,
        chunks: context.chunks,
      });

      return {
        success: true,
        action,
        markdown: insights?.markdown || "",
        chunkGroups: insights?.chunkGroups || 0,
        generatedAt: insights?.generatedAt || new Date().toISOString(),
        context: {
          chunkCount: context.chunkCount,
          wordCount: context.wordCount,
          truncated: context.truncated,
        },
      };
    },
  );

  registerMessageHandler("myz:getSelection", async () => {
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : "";
    return { text };
  });

  registerMessageHandler(
    "myz:fetchImageAsDataUrl",
    async (payload: { srcUrl?: string }) => {
      const srcUrl =
        typeof payload?.srcUrl === "string" ? payload.srcUrl.trim() : "";
      if (!srcUrl) {
        throw new Error("srcUrl is required");
      }
      if (srcUrl.startsWith("data:")) {
        const mimeType = srcUrl.slice(5).split(";")[0] || "";
        return { dataUrl: srcUrl, mimeType };
      }

      const response = await fetch(srcUrl, { credentials: "include" });
      if (!response.ok) {
        throw new Error(
          `fetch image failed: ${response.status} ${response.statusText}`,
        );
      }

      const blob = await response.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Failed to read image blob"));
        reader.readAsDataURL(blob);
      });
      if (!dataUrl.startsWith("data:")) {
        throw new Error("Failed to convert image to data URL");
      }
      return { dataUrl, mimeType: blob.type || "" };
    },
  );

  registerMessageHandler(
    "myz:extractSearchResults",
    async (payload: { engine?: string; limit?: number }) => {
      const engine = payload?.engine === "google" ? "google" : "bing";
      const limit =
        typeof payload?.limit === "number" && payload.limit > 0
          ? Math.min(10, Math.floor(payload.limit))
          : 5;

      const results: Array<{ title: string; url: string; snippet: string }> = [];

      const pushResult = (title: string, url: string, snippet: string) => {
        const normalizedUrl = typeof url === "string" ? url.trim() : "";
        if (!normalizedUrl || !normalizedUrl.startsWith("http")) {
          return;
        }
        const normalizedTitle = typeof title === "string" ? title.trim() : "";
        const normalizedSnippet = typeof snippet === "string" ? snippet.trim() : "";
        results.push({
          title: normalizedTitle,
          url: normalizedUrl,
          snippet: normalizedSnippet,
        });
      };

      const textContent = (el: Element | null | undefined) =>
        el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "";

      if (engine === "bing") {
        const items = Array.from(document.querySelectorAll("li.b_algo"));
        for (const item of items) {
          if (results.length >= limit) break;
          const a = item.querySelector("h2 a");
          const title = textContent(a);
          const url = (a as HTMLAnchorElement | null)?.href || "";
          const snippet =
            textContent(item.querySelector("div.b_caption p")) ||
            textContent(item.querySelector("p"));
          pushResult(title, url, snippet);
        }
      } else {
        const items = Array.from(document.querySelectorAll("div#search a h3"));
        for (const h3 of items) {
          if (results.length >= limit) break;
          const anchor = h3.closest("a") as HTMLAnchorElement | null;
          const title = textContent(h3);
          const url = anchor?.href || "";

          let snippet = "";
          try {
            const container = anchor?.closest("div");
            if (container) {
              snippet =
                textContent(container.querySelector("div[data-sncf='1']")) ||
                textContent(container.querySelector("div.VwiC3b")) ||
                textContent(container.querySelector("span"));
            }
          } catch {}

          pushResult(title, url, snippet);
        }
      }

      return { engine, results };
    },
  );
}
