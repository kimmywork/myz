import type { AIModelSetting, MaxOutputTokenParam } from "../../settings.js";
import { injectSystemPromptAsUserMessage } from "../prompt/systemPrompt.js";
import type {
  ChatCompletionClient,
  ProviderChatCompletionRequest,
  ProviderMessage,
} from "../providers/types.js";

export interface ToolSelectionCandidate {
  name: string;
  description?: string;
  server?: string;
}

function extractFirstJsonObject(text: string) {
  const raw = typeof text === "string" ? text : "";
  if (!raw.trim()) return null;
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace < 0 || lastBrace <= firstBrace) {
    return null;
  }
  const slice = raw.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

function normalizeMaxOutput(model: AIModelSetting, fallback = 128, cap = 256) {
  const max =
    typeof model?.limits?.maxOutputTokens === "number"
      ? model.limits.maxOutputTokens
      : fallback;
  return Math.max(16, Math.min(cap, Math.floor(max || fallback)));
}

function buildSystemPrompt() {
  return [
    "你是工具选择器。",
    "任务：从候选工具中选出本次对话需要暴露给主模型的最小集合。",
    "原则：默认空；只从候选列表选择；避免不必要的数据访问。",
    "依赖规则：若需要联网检索，必须同时选择 WebSearch 与 WebFetch。",
    '仅输出 JSON：{ "tool_names": ["..."] }',
  ].join("\n");
}

function buildUserPrompt(prompt: string, tools: ToolSelectionCandidate[]) {
  const normalizedPrompt = typeof prompt === "string" ? prompt.trim() : "";
  const serializedTools = JSON.stringify(
    (tools || []).map((tool) => ({
      name: tool.name,
      server: tool.server || "",
      description: tool.description || "",
    })),
    null,
    2,
  );

  return [
    "用户输入：",
    normalizedPrompt || "(空)",
    "",
    "候选工具列表（JSON）：",
    serializedTools,
    "",
    "请返回本次需要启用的 tool_names（可为空数组）。",
  ].join("\n");
}

export class ToolSelectionAgent {
  async selectToolNames(options: {
    prompt: string;
    tools: ToolSelectionCandidate[];
    client: ChatCompletionClient;
    model: AIModelSetting;
  }): Promise<string[]> {
    const candidateNames = new Set(
      (options.tools || [])
        .map((tool) => (typeof tool?.name === "string" ? tool.name.trim() : ""))
        .filter(Boolean),
    );
    if (!candidateNames.size) {
      return [];
    }

    const maxOutputTokens = normalizeMaxOutput(options.model, 128, 256);
    const maxOutputTokenParam: MaxOutputTokenParam =
      options.model?.limits?.maxOutputTokenParam === "max_completion_tokens"
        ? "max_completion_tokens"
        : "max_tokens";

    const baseMessages: ProviderMessage[] = [
      { role: "system", content: buildSystemPrompt() },
      {
        role: "user",
        content: buildUserPrompt(options.prompt, options.tools || []),
      },
    ];
    const messages = injectSystemPromptAsUserMessage(
      baseMessages,
      Boolean(options.model?.systemPromptInUserMessage),
    );
    const request: ProviderChatCompletionRequest = {
      model: options.model.model,
      messages,
      temperature: 0.0,
      stream: false,
    };
    if (maxOutputTokenParam === "max_completion_tokens") {
      request.max_completion_tokens = maxOutputTokens;
    } else {
      request.max_tokens = maxOutputTokens;
    }

    const response = await options.client.createCompletion(request, {
      enableGeminiThinking: Boolean(options.model.capabilities.reasoning),
    });
    const text = String(response?.choices?.[0]?.message?.content || "").trim();
    const parsed = extractFirstJsonObject(text);

    const toolNames = Array.isArray(parsed?.tool_names)
      ? parsed.tool_names
      : [];
    const normalized = toolNames
      .filter(
        (name: unknown): name is string =>
          typeof name === "string" && name.trim().length > 0,
      )
      .map((name: string) => name.trim())
      .filter((name: string) => candidateNames.has(name));

    return Array.from(new Set(normalized));
  }
}
