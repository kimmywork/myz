import type {
  AIAssistantSettings,
  AIProviderSetting,
  Settings,
} from "./settings";
import { getAiHeaderValue } from "@/shared/aiHeaderUtils.js";
import { isRecord } from "@/shared/typeUtils";

type ResourceType = chrome.declarativeNetRequest.ResourceType;

const ResourceTypeValues =
  globalThis.chrome?.declarativeNetRequest?.ResourceType;

const AI_USER_AGENT_RULE_BASE_ID = 1100;
const AI_USER_AGENT_RULE_MAX = 20;
const HEADER_RESOURCE_TYPES: ResourceType[] = ResourceTypeValues
  ? [ResourceTypeValues.XMLHTTPREQUEST, ResourceTypeValues.OTHER]
  : [];

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildRegexFilterForEndpoint(endpoint: string): string | null {
  if (!endpoint) {
    return null;
  }
  try {
    const url = new URL(endpoint);
    const origin = url.origin;
    if (!origin) {
      return null;
    }
    return `^${escapeRegex(origin)}.*`;
  } catch {
    return null;
  }
}

function pickProviderIdsFromAgents(settings: Partial<Settings> = {}) {
  const ids = new Set<string>();
  const agents = isRecord(settings.aiAgents) ? settings.aiAgents : null;
  const conversationProvider =
    isRecord(agents?.conversation) && isRecord(agents.conversation.target)
      ? agents.conversation.target.providerId
      : undefined;
  const insightsProvider =
    isRecord(agents?.insights) && isRecord(agents.insights.target)
      ? agents.insights.target.providerId
      : undefined;
  const autoHighlightProvider =
    isRecord(agents?.autoHighlight) && isRecord(agents.autoHighlight.target)
      ? agents.autoHighlight.target.providerId
      : undefined;
  [conversationProvider, insightsProvider, autoHighlightProvider].forEach(
    (value) => {
      if (typeof value === "string" && value.trim()) {
        ids.add(value.trim());
      }
    },
  );
  return [...ids];
}

function resolveHeaderTargets(settings: Partial<Settings> = {}) {
  const providers = Array.isArray(settings.aiProviders)
    ? settings.aiProviders
    : [];
  const selectedIds = pickProviderIdsFromAgents(settings);
  const selectedProviders = selectedIds
    .map((id) => providers.find((p) => p?.id === id))
    .filter((provider): provider is AIProviderSetting => Boolean(provider));

  return selectedProviders
    .map((provider) => ({
      baseUrl: typeof provider.baseUrl === "string" ? provider.baseUrl : "",
      headers: typeof provider.headers === "string" ? provider.headers : "",
    }))
    .filter((item) => item.baseUrl && item.headers);
}

export async function syncAiRequestHeaderRules(
  settings: Partial<AIAssistantSettings> = {},
) {
  if (!chrome?.declarativeNetRequest?.updateDynamicRules) {
    return;
  }

  const targets = resolveHeaderTargets(settings);
  const addRules: chrome.declarativeNetRequest.Rule[] = [];

  targets.slice(0, AI_USER_AGENT_RULE_MAX).forEach((target, index) => {
    const userAgent = getAiHeaderValue(target.headers, "user-agent");
    const regexFilter = userAgent
      ? buildRegexFilterForEndpoint(target.baseUrl)
      : null;
    if (!userAgent || !regexFilter) {
      return;
    }
    const id = AI_USER_AGENT_RULE_BASE_ID + index + 1;
    const rule: chrome.declarativeNetRequest.Rule = {
      id,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: [
          {
            header: "user-agent",
            operation: "set",
            value: userAgent,
          },
        ],
      },
      condition: {
        regexFilter,
        resourceTypes: HEADER_RESOURCE_TYPES,
        initiatorDomains: [],
      },
    };

    const initiatorDomain = chrome.runtime?.id;
    if (initiatorDomain) {
      rule.condition.initiatorDomains = [initiatorDomain];
    }

    addRules.push(rule);
  });

  try {
    const removeRuleIds = Array.from(
      { length: AI_USER_AGENT_RULE_MAX },
      (_, idx) => AI_USER_AGENT_RULE_BASE_ID + idx + 1,
    );
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules,
    });
  } catch (error) {
    console.warn("Failed to update AI request header rules:", error);
  }
}
