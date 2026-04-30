import type { TokenUsage, Message, ImageAttachment } from "@myz/ai-core/types";
import { normalizeMessagePayload } from "@myz/ai-core/normalize/message";
import type { AIAssistantSettings } from "@myz/ai-core/settings";
import type {
  ProviderChatCompletionRequest,
  ProviderMessage,
  ProviderStreamOptions,
  ProviderToolCall,
  ProviderToolChoice,
} from "@myz/ai-core/providers/types";
import { createProviderClients } from "@myz/ai-core/providers/registry";
import { resolveAgentTarget } from "@myz/ai-core/runtime/agentSelection";
import { isRecord } from "@myz/shared";
import type { DesktopStoredSettings } from "../types/settings";
import type { DesktopWorkspaceContext } from "../../host/desktop";
import {
  executeDesktopLocalToolCall,
  getDesktopLocalToolSpecs,
} from "./desktopAgentTools";

export interface DesktopChatCompletionResult {
  content: string;
  reasoning: string;
  model: string;
  timestamp: string;
  usage?: TokenUsage;
  contextWindow: number;
  requestDurationMs: number;
}

interface DesktopChatRuntimeOptions {
  settings: DesktopStoredSettings;
  conversationId: string;
  transcript: Message[];
  workspaceContext: DesktopWorkspaceContext | null;
  onToolCallMessage?: (message: Message) => void | Promise<void>;
  onToolResultMessage?: (message: Message) => void | Promise<void>;
  onStreamDelta?: (delta: { content: string; reasoning: string }) => void;
}

function createSystemPrompt(
  settings: DesktopStoredSettings,
  workspaceContext: DesktopWorkspaceContext | null,
) {
  const prompt = [
    "你是 MyZ Desktop 内置聊天助理。",
    "请基于当前对话历史直接回答用户问题。",
    "回答要真实、简洁，并优先使用清晰的 Markdown。",
  ];

  const personaName = settings.desktopAgent.personaName.trim();
  const rolePrompt = settings.desktopAgent.rolePrompt.trim();

  if (personaName) {
    prompt.push(`当前角色名：${personaName}`);
  }
  if (rolePrompt) {
    prompt.push(`角色要求：${rolePrompt}`);
  }
  if (workspaceContext?.workspaceRoot) {
    prompt.push(
      `默认工作区：${workspaceContext.workspaceRoot}`,
      `边界约束：所有文件、目录、脚本与产物都必须限制在 ${workspaceContext.scopeLabel} 内，不允许假设或建议越界访问工作区之外的本地路径。`,
      `工作区约定文件：${workspaceContext.agentsFile}`,
    );
  }

  return prompt.join("\n");
}

function normalizeAttachments(
  metadata: Message["metadata"],
): ImageAttachment[] {
  const rawAttachments = metadata?.attachments;
  if (!Array.isArray(rawAttachments)) {
    return [];
  }
  return rawAttachments.filter(
    (item): item is ImageAttachment =>
      isRecord(item) &&
      item.type === "image" &&
      typeof item.dataUrl === "string",
  );
}

function toUserContent(message: Message): ProviderMessage["content"] {
  const text = typeof message.content === "string" ? message.content : "";
  const attachments = normalizeAttachments(message.metadata);
  if (!attachments.length) {
    return text;
  }

  const parts: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [];

  if (text.trim()) {
    parts.push({
      type: "text",
      text,
    });
  }

  attachments.forEach((attachment) => {
    if (!attachment.dataUrl) return;
    parts.push({
      type: "image_url",
      image_url: {
        url: attachment.dataUrl,
      },
    });
  });

  return parts.length ? parts : text;
}

function toProviderMessage(message: Message): ProviderMessage | null {
  if (!message) return null;

  if (message.role === "user") {
    return {
      role: "user",
      content: toUserContent(message),
    };
  }

  if (message.role === "assistant") {
    return {
      role: "assistant",
      content: message.content || "",
    };
  }

  if (message.role === "system") {
    return {
      role: "system",
      content: message.content || "",
    };
  }

  if (message.role === "tool") {
    return {
      role: "tool",
      content: message.content || "",
      tool_call_id:
        typeof message.tool_call_id === "string"
          ? message.tool_call_id
          : undefined,
    };
  }

  return null;
}

function buildToolChoice(
  mode: DesktopStoredSettings["aiProviders"][number]["models"][number]["tooling"]["toolChoice"]["mode"],
  toolName: string | undefined,
  availableToolNames: string[],
): ProviderToolChoice | undefined {
  if (mode === "auto" || mode === "none" || mode === "required") {
    return mode;
  }
  if (mode === "tool" && toolName && availableToolNames.includes(toolName)) {
    return { type: "function", function: { name: toolName } };
  }
  return undefined;
}

function buildToolInvocationContent(toolCalls: ProviderToolCall[]) {
  return toolCalls
    .map((toolCall, index) => `[Tool ${index + 1}: ${toolCall.function.name}]`)
    .join("\n");
}

function createToolCallMessage(payload: {
  conversationId: string;
  model: string;
  message: ProviderMessage;
}): Message {
  const toolCalls = Array.isArray(payload.message.tool_calls)
    ? payload.message.tool_calls
    : [];
  return {
    id: `assistant-tool-${crypto.randomUUID()}`,
    conversationId: payload.conversationId,
    role: "assistant",
    content: buildToolInvocationContent(toolCalls),
    timestamp: new Date().toISOString(),
    metadata: {
      hasToolCalls: toolCalls.length > 0,
      toolInvocationOnly: true,
      toolCallCount: toolCalls.length,
      toolNames: toolCalls.map((toolCall) => toolCall.function.name),
      toolCallDetails: toolCalls.map((toolCall) => ({
        id: toolCall.id,
        name: toolCall.function.name,
        arguments: toolCall.function.arguments,
      })),
      model: payload.model,
    },
  };
}

function createToolResultMessage(payload: {
  conversationId: string;
  message: ProviderMessage;
}): Message {
  const metadata = isRecord(payload.message.metadata)
    ? payload.message.metadata
    : null;
  const toolName =
    typeof metadata?.toolName === "string" ? metadata.toolName : "Tool";
  const toolArgs =
    typeof metadata?.toolArgs === "string" ? metadata.toolArgs : "";
  return {
    id: `tool-${crypto.randomUUID()}`,
    conversationId: payload.conversationId,
    role: "tool",
    content:
      typeof payload.message.content === "string"
        ? payload.message.content
        : "",
    timestamp: new Date().toISOString(),
    tool_call_id:
      typeof payload.message.tool_call_id === "string"
        ? payload.message.tool_call_id
        : undefined,
    metadata: {
      toolName,
      toolArgs,
      error: typeof metadata?.error === "string" ? metadata.error : undefined,
    },
  };
}

function buildRequest(
  settings: DesktopStoredSettings,
  transcript: Message[],
  workspaceContext: DesktopWorkspaceContext | null,
): {
  request: ProviderChatCompletionRequest;
  modelName: string;
  contextWindow: number;
} {
  const target = resolveAgentTarget(
    settings as unknown as AIAssistantSettings,
    "conversation",
  );

  const request: ProviderChatCompletionRequest = {
    model: target.model.model,
    messages: [
      {
        role: "system",
        content: createSystemPrompt(settings, workspaceContext),
      },
      ...transcript
        .map((message) => toProviderMessage(message))
        .filter((message): message is ProviderMessage => message !== null),
    ],
    temperature: target.temperature,
    stream: true,
  };

  if (target.model.limits.maxOutputTokenParam === "max_completion_tokens") {
    request.max_completion_tokens = target.model.limits.maxOutputTokens;
  } else {
    request.max_tokens = target.model.limits.maxOutputTokens;
  }

  return {
    request,
    modelName: target.model.model,
    contextWindow: target.model.limits.contextWindow,
  };
}

export async function streamDesktopConversation(
  options: DesktopChatRuntimeOptions,
): Promise<DesktopChatCompletionResult> {
  const { request, modelName, contextWindow } = buildRequest(
    options.settings,
    options.transcript,
    options.workspaceContext,
  );
  const target = resolveAgentTarget(
    options.settings as unknown as AIAssistantSettings,
    "conversation",
  );
  const tools = getDesktopLocalToolSpecs(options.settings);
  const availableToolNames = tools.map((tool) => tool.function.name);
  const toolChoice = buildToolChoice(
    target.model.tooling.toolChoice.mode,
    target.model.tooling.toolChoice.toolName,
    availableToolNames,
  );
  const toolingOptions: ProviderStreamOptions["tooling"] | undefined =
    tools.length
      ? {
          toolChoice,
          parallelToolCalls:
            target.model.tooling.parallelToolCalls === "on"
              ? true
              : target.model.tooling.parallelToolCalls === "off"
                ? false
                : undefined,
          strict:
            target.model.tooling.strict === "on"
              ? true
              : target.model.tooling.strict === "off"
                ? false
                : undefined,
        }
      : undefined;
  const { client, clientWithTools } = createProviderClients(
    target.provider,
    tools.length
      ? {
          getTools: async () => tools,
          executeToolCall: executeDesktopLocalToolCall,
        }
      : undefined,
  );
  const startedAt = Date.now();

  const response = await (
    tools.length ? clientWithTools : client
  ).createCompletion(request, {
    enableReasoning: Boolean(target.model.capabilities.reasoning),
    enableGeminiThinking: Boolean(target.model.capabilities.reasoning),
    tooling: toolingOptions,
    onToolCallMessage: async (message) => {
      if (!options.onToolCallMessage) {
        return;
      }
      await options.onToolCallMessage(
        createToolCallMessage({
          conversationId: options.conversationId,
          model: modelName,
          message,
        }),
      );
    },
    onToolResultMessage: async (message) => {
      if (!options.onToolResultMessage) {
        return;
      }
      await options.onToolResultMessage(
        createToolResultMessage({
          conversationId: options.conversationId,
          message,
        }),
      );
    },
    onStreamDelta: (delta) => {
      options.onStreamDelta?.({
        content: typeof delta.content === "string" ? delta.content : "",
        reasoning: typeof delta.reasoning === "string" ? delta.reasoning : "",
      });
    },
  });

  const { content, reasoning } = normalizeMessagePayload(
    response?.choices?.[0]?.message,
  );
  const usage =
    isRecord(response) && response.usage
      ? (response.usage as TokenUsage)
      : undefined;

  return {
    content,
    reasoning,
    model: modelName,
    timestamp: new Date().toISOString(),
    usage,
    contextWindow,
    requestDurationMs: Date.now() - startedAt,
  };
}

export function deriveConversationTitle(input: string) {
  const normalized = String(input || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return "未命名对话";
  }
  if (normalized.length <= 36) {
    return normalized;
  }
  return `${normalized.slice(0, 36)}…`;
}
