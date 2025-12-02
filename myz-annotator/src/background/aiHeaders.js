import { getAiHeaderValue } from "../shared/aiHeaderUtils.js";

const AI_USER_AGENT_RULE_ID = 1001;
const HEADER_RESOURCE_TYPES = ["xmlhttprequest", "other"];

function escapeRegex(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildRegexFilterForEndpoint(endpoint) {
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

export async function syncAiRequestHeaderRules(settings = {}) {
  if (!chrome?.declarativeNetRequest?.updateDynamicRules) {
    return;
  }

  const userAgent = getAiHeaderValue(settings.aiRequestHeaders, "user-agent");
  const regexFilter = userAgent
    ? buildRegexFilterForEndpoint(settings.aiApiEndpoint)
    : null;

  const addRules = [];
  if (userAgent && regexFilter) {
    const rule = {
      id: AI_USER_AGENT_RULE_ID,
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
      },
    };

    const initiatorDomain = chrome.runtime?.id;
    if (initiatorDomain) {
      rule.condition.initiatorDomains = [initiatorDomain];
    }

    addRules.push(rule);
  }

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [AI_USER_AGENT_RULE_ID],
      addRules,
    });
  } catch (error) {
    console.warn("Failed to update AI request header rules:", error);
  }
}
