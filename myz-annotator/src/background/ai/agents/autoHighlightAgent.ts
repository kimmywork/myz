import type {
  AIModelSetting,
  AIProviderSetting,
  AutoHighlightCategory,
  MaxOutputTokenParam,
} from "../../settings.js";
import { normalizeMessagePayload } from "../normalize/message.js";
import { PromptBuilder } from "../prompt/builder.js";
import { injectSystemPromptAsUserMessage } from "../prompt/systemPrompt.js";
import type {
  ChatCompletionClient,
  ProviderChatCompletionChoice,
  ProviderChatCompletionRequest,
} from "../providers/types.js";
import { AUTO_HIGHLIGHT_CATEGORIES } from "@/shared/types.js";
import { isRecord } from "@/shared/typeUtils";

export interface AutoHighlightPayload {
  text: string;
  title?: string;
  url?: string;
  maxHighlights?: number;
  temperature?: number;
}

export interface AutoHighlightItem {
  start: number;
  end: number;
  text: string;
  tags: string[];
  category?: AutoHighlightCategory;
}

export interface AutoHighlightResult {
  highlights: AutoHighlightItem[];
  raw?: string;
}

export interface AutoHighlightAgentDeps {
  client: ChatCompletionClient;
}

const DEFAULT_MAX_HIGHLIGHTS = 15;
const MAX_CONTINUE_ATTEMPTS = 3;
const CATEGORY_OPTIONS = Object.values(
  AUTO_HIGHLIGHT_CATEGORIES,
) as AutoHighlightCategory[];

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeSnippet(value: string) {
  if (!value) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildPunctuationWildcardPattern(value: string) {
  const normalized = normalizeSnippet(value);
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
    const isPunctuation = /[\p{P}\p{S}]/u.test(ch);
    if (!inCode && isPunctuation) {
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

function findMatchWithPunctuationWildcard(text: string, snippet: string) {
  const pattern = buildPunctuationWildcardPattern(snippet);
  if (!pattern) return null;
  const regex = new RegExp(pattern, "u");
  const match = regex.exec(text);
  if (!match) return null;
  const start = match.index;
  const end = start + match[0].length;
  return { start, end };
}

function stripTrailingPunctuation(value: string) {
  const trimmed = normalizeSnippet(value);
  const stripped = trimmed.replace(/[。！？!?…，,；;：:、．.]+$/g, "").trim();
  return { stripped, removed: stripped !== trimmed };
}

function extractJsonPayload(text: string) {
  const raw = typeof text === "string" ? text.trim() : "";
  if (!raw) return null;

  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : raw;

  if (candidate.startsWith("{") || candidate.startsWith("[")) {
    try {
      return JSON.parse(candidate);
    } catch {
      // fallthrough to brace search
    }
  }

  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    return null;
  }
  const slice = candidate.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const normalized = input
    .map((tag) =>
      typeof tag === "string" ? tag.replace(/^#+/, "").trim() : "",
    )
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function normalizeHighlights(
  payload: unknown,
  text: string,
  options: {
    maxHighlights: number;
  },
): AutoHighlightItem[] {
  const candidates =
    isRecord(payload) && Array.isArray(payload.highlights)
      ? payload.highlights
      : Array.isArray(payload)
      ? payload
      : [];

  if (!candidates.length) return [];

  const items: AutoHighlightItem[] = [];
  const seen = new Set<string>();
  const textLength = text.length;

  for (const entry of candidates) {
    const entryRecord = isRecord(entry) ? entry : {};
    const rawText =
      typeof entryRecord.text === "string" ? entryRecord.text : "";
    const normalizedText = normalizeSnippet(rawText);
    const relaxed = stripTrailingPunctuation(normalizedText);

    const start = clampNumber(entryRecord.start, 0, textLength, -1);
    const end = clampNumber(entryRecord.end, 0, textLength, -1);
    const safeStart = Number.isFinite(start)
      ? Math.max(0, Math.min(textLength, Math.floor(start)))
      : -1;
    const safeEnd = Number.isFinite(end)
      ? Math.max(0, Math.min(textLength, Math.floor(end)))
      : -1;
    let resolvedStart = safeStart;
    let resolvedEnd = safeEnd;

    if (normalizedText) {
      const hasValidRange = resolvedEnd > resolvedStart;
      const rangeText = hasValidRange
        ? normalizeSnippet(text.slice(resolvedStart, resolvedEnd))
        : "";
      if (!hasValidRange || rangeText !== normalizedText) {
        let index = text.indexOf(normalizedText);
        if (index === -1 && relaxed.removed && relaxed.stripped) {
          index = text.indexOf(relaxed.stripped);
          if (index !== -1) {
            resolvedStart = index;
            resolvedEnd = index + relaxed.stripped.length;
          } else {
            const wildcardMatch = findMatchWithPunctuationWildcard(
              text,
              relaxed.stripped,
            );
            if (wildcardMatch) {
              resolvedStart = wildcardMatch.start;
              resolvedEnd = wildcardMatch.end;
            } else {
              continue;
            }
          }
        } else if (index !== -1) {
          resolvedStart = index;
          resolvedEnd = index + normalizedText.length;
        } else {
          const wildcardMatch = findMatchWithPunctuationWildcard(
            text,
            normalizedText,
          );
          if (wildcardMatch) {
            resolvedStart = wildcardMatch.start;
            resolvedEnd = wildcardMatch.end;
          } else {
            continue;
          }
        }
      }
    }

    if (!(resolvedEnd > resolvedStart)) continue;

    const slice = text.slice(resolvedStart, resolvedEnd);
    const candidateText = rawText || slice;

    const key = `${resolvedStart}:${resolvedEnd}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const categoryCandidate =
      typeof entryRecord.category === "string"
        ? entryRecord.category.trim().toLowerCase()
        : "";
    const category = CATEGORY_OPTIONS.includes(
      categoryCandidate as AutoHighlightCategory,
    )
      ? (categoryCandidate as AutoHighlightCategory)
      : AUTO_HIGHLIGHT_CATEGORIES.CONCEPTUAL;

    items.push({
      start: resolvedStart,
      end: resolvedEnd,
      text: candidateText,
      tags: normalizeTags(entryRecord.tags),
      category,
    });

    if (items.length >= options.maxHighlights) break;
  }

  return items;
}

function resolveMaxOutputTokens(model: AIModelSetting) {
  const modelLimit =
    typeof model?.limits?.maxOutputTokens === "number"
      ? Math.floor(model.limits.maxOutputTokens)
      : 0;
  return modelLimit > 4096 ? modelLimit : 4096;
}

function buildSystemPrompt(options: { maxHighlights: number }) {
  return [
    "你是自动标注助手。",
    "目标：从文本中提取重点句，分类为 conceptual / structural / behavioural。",
    "仅输出 JSON。",
    '格式：{ "highlights": [{ "start": 0, "end": 0, "text": "...", "tags": ["标签"], "category": "conceptual" }] }',
    "规则：",
    `- 数量 ≤ ${options.maxHighlights}，完整句子，互不重叠、不重复。`,
    "- start/end 为 0-based 且 end 为排除；text 必须与 [start, end) 完全一致。",
    "- category 仅可 conceptual / structural / behavioural。",
    "- tags 为中文短语（2-5 个），不带 #，不含“AI生成标注”。",
  ].join("\n");
}

function buildUserPrompt(payload: AutoHighlightPayload) {
  return [
    `页面标题: ${payload.title || "未命名页面"}`,
    `URL: ${payload.url || ""}`,
    "正文内容如下（已做空白规范化：连续空白已压缩为单个空格，首尾空白已去除）：",
    payload.text || "",
  ].join("\n");
}

export class AutoHighlightAgent {
  private deps: AutoHighlightAgentDeps;

  constructor(deps: AutoHighlightAgentDeps) {
    this.deps = deps;
  }

  async generateAutoHighlightsWithConfig(
    payload: Partial<AutoHighlightPayload> = {},
    deps: {
      isEnabled: boolean;
      callConfig: {
        provider: AIProviderSetting;
        model: AIModelSetting;
        temperature: number;
      };
    },
  ): Promise<AutoHighlightResult> {
    if (!deps.isEnabled) {
      throw new Error("AI Assistant is not enabled");
    }

    const text = typeof payload.text === "string" ? payload.text.trim() : "";
    if (!text) {
      throw new Error("No page content provided");
    }

    const maxHighlights = clampNumber(
      payload.maxHighlights,
      5,
      30,
      DEFAULT_MAX_HIGHLIGHTS,
    );
    const prompt = new PromptBuilder()
      .addSystem(
        buildSystemPrompt({
          maxHighlights,
        }),
      )
      .addUser(
        buildUserPrompt({
          title: payload.title,
          url: payload.url,
          text,
        }),
      );

    const maxOutputTokens = resolveMaxOutputTokens(deps.callConfig.model);
    const maxOutputTokenParam: MaxOutputTokenParam =
      deps.callConfig.model.limits.maxOutputTokenParam;

    const request: ProviderChatCompletionRequest = {
      model: deps.callConfig.model.model,
      messages: injectSystemPromptAsUserMessage(
        prompt.build(),
        Boolean(deps.callConfig.model?.systemPromptInUserMessage),
      ),
      temperature:
        typeof payload.temperature === "number"
          ? payload.temperature
          : deps.callConfig.temperature,
    };

    if (deps.callConfig.model.model.startsWith("gpt-oss")) {
      request.reasoning_effort = "low";
    }

    if (maxOutputTokenParam === "max_completion_tokens") {
      request.max_completion_tokens = maxOutputTokens;
    } else {
      request.max_tokens = maxOutputTokens;
    }

    const messages = [...request.messages];
    let combinedContent = "";
    let attempts = 0;

    do {
      const response = await this.deps.client.createCompletion(
        {
          ...request,
          messages,
        },
        {
          enableGeminiThinking: Boolean(
            deps.callConfig.model.capabilities.reasoning,
          ),
        },
      );

      const choice =
        response?.choices?.[0] || ({} as ProviderChatCompletionChoice);
      const finishReason =
        typeof choice.finish_reason === "string" ? choice.finish_reason : "";
      const normalizedResponse = normalizeMessagePayload(choice.message);
      const chunk =
        typeof normalizedResponse.content === "string"
          ? normalizedResponse.content
          : "";
      if (chunk) {
        combinedContent += chunk;
        messages.push({ role: "assistant", content: chunk });
      }

      if (finishReason !== "length") {
        break;
      }

      attempts += 1;
      if (attempts > MAX_CONTINUE_ATTEMPTS) {
        break;
      }

      // messages.push({ role: "user", content: "continue" })
    } while (true);

    const parsed = extractJsonPayload(combinedContent);
    const highlights = normalizeHighlights(parsed, text, { maxHighlights });

    if (!highlights.length) {
      throw new Error("No valid highlights generated");
    }

    return { highlights, raw: combinedContent };
  }
}
