import {
  saveMessage,
  getConversation,
  getMessagesForConversation,
} from "../../../sidepanel/aiStorage.js";
import { readAiConversations } from "../../ai.js";
import type {
  AIModelSetting,
  AIProviderSetting,
  MaxOutputTokenParam,
} from "../../settings.js";
import { readSettings } from "../../storage.js";
import { normalizeMessagePayload } from "../normalize/message.js";
import { buildConversationPromptMessages } from "../prompt/conversation.js";
import { injectSystemPromptAsUserMessage } from "../prompt/systemPrompt.js";
import type {
  ChatCompletionClient,
  ProviderChatCompletionRequest,
  ProviderChatCompletionResponse,
  ProviderMessage,
  ProviderStreamDelta,
  ProviderStreamOptions,
  ProviderToolChoice,
  ProviderToolCall,
} from "../providers/types.js";
import { listSkills } from "../skills/storage.js";
import type {
  Message,
  MessageInPayload,
  ProcessConversationOptions,
  ProcessConversationResult,
  ToolCall,
  ToolInvocationDetails,
  MessageStreamData,
} from "../types.js";
import {
  normalizeTaskPlanPayload,
  type TaskItem,
  type TaskPlan,
} from "../tasks/taskManager.js";
import type { JsonRecord } from "@/shared/typeUtils";
import { isRecord, toJsonRecord } from "@/shared/typeUtils";

const AUTO_CONTINUE_MAX_TURNS = 4;
const REQUIRE_USER_INPUT_MARKER = "[REQUIRE_USER_INPUT]";
const AUTO_CONTINUE_KEYWORDS = [
  "继续",
  "接下来",
  "下一步",
  "我会",
  "我将",
  "马上",
  "开始",
  "继续执行",
  "继续完成",
  "继续处理",
  "continue",
  "next",
  "i will",
  "i'll",
];
const AUTO_CONTINUE_STOPWORDS = [
  "已完成",
  "完成了",
  "任务完成",
  "完成任务",
  "done",
  "completed",
  "all done",
  "finished",
];

function generateId(prefix = "msg") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeConversationMode(value: unknown): "agent" | "chat" {
  return value === "chat" ? "chat" : "agent";
}

function buildTaskPlanSummary(plan?: TaskPlan | null) {
  if (!plan || !plan.tasks.length) {
    return "当前暂无任务计划。";
  }
  const lines = plan.tasks.map((task, index: number) => {
    const title = task?.title || "未命名任务";
    const status = task?.status || "pending";
    const deliverables = Array.isArray(task?.deliverables)
      ? task.deliverables
          .map((deliverable) => {
            const desc = deliverable?.description || "交付物";
            const dStatus = deliverable?.status || "pending";
            return `${desc}(${dStatus})`;
          })
          .join("; ")
      : "";
    const suffix = deliverables ? ` - 交付物: ${deliverables}` : "";
    return `${index + 1}. ${title} [${status}]${suffix}`;
  });
  return lines.join("\n");
}

function buildSkillListBlock(
  skills: Array<{ name: string; description?: string }>,
) {
  if (!skills.length) return "";
  return [
    "可用技能列表（均已启用）：",
    "<available_skills>",
    ...skills.map((skill) =>
      [
        "  <skill>",
        `    <name>${escapeXml(skill.name)}</name>`,
        `    <description>${escapeXml(skill.description || "")}</description>`,
        `    <location>/skills/${escapeXml(skill.name)}/SKILL.md</location>`,
        "  </skill>",
      ].join("\n"),
    ),
    "</available_skills>",
  ].join("\n");
}

function getCurrentTask(plan?: TaskPlan | null): TaskItem | null {
  if (!plan || !plan.tasks.length) return null;
  const isBlocked = (task: TaskItem) => {
    const blockedBy = Array.isArray(task?.blockedBy) ? task.blockedBy : [];
    if (!blockedBy.length) return false;
    return blockedBy.some((id: string) => {
      const blocker = plan.tasks.find((item) => item?.id === id);
      return !blocker || blocker.status !== "done";
    });
  };
  const currentId =
    typeof plan.currentTaskId === "string" ? plan.currentTaskId : "";
  const byId = currentId
    ? plan.tasks.find((task) => task?.id === currentId)
    : null;
  if (byId && byId.status !== "done" && !isBlocked(byId)) return byId;
  const inProgress = plan.tasks.find(
    (task) => task?.status === "in_progress" && !isBlocked(task),
  );
  if (inProgress) return inProgress;
  const nextPending = plan.tasks.find(
    (task) => task?.status !== "done" && !isBlocked(task),
  );
  return nextPending || plan.tasks[0] || null;
}

function buildTaskExecutionDirective(plan?: TaskPlan | null) {
  if (!plan || !plan.tasks.length) return "";
  const original =
    typeof plan.originalUserRequest === "string"
      ? plan.originalUserRequest.trim()
      : "";
  const currentTask = getCurrentTask(plan);
  const currentTitle =
    typeof currentTask?.title === "string" ? currentTask.title.trim() : "";
  const owner =
    typeof currentTask?.owner === "string" ? currentTask.owner.trim() : "";
  const category =
    typeof currentTask?.category === "string"
      ? currentTask.category.trim()
      : "";
  const skills = Array.isArray(currentTask?.skills)
    ? currentTask.skills
        .map((skill) => (typeof skill === "string" ? skill.trim() : ""))
        .filter(Boolean)
    : [];
  const deliverables = Array.isArray(currentTask?.deliverables)
    ? currentTask.deliverables
        .map((deliverable) =>
          typeof deliverable?.description === "string"
            ? deliverable.description.trim()
            : "",
        )
        .filter(Boolean)
    : [];

  return [
    "执行指令：严格按任务列表执行并使用 Task 更新进度与交付物。",
    "默认做合理假设并继续，仅在需要账号/权限或高风险操作时提问。",
    "必要时可调用 PromptingAgent 处理一次性子任务，再回到当前任务继续执行。",
    original ? `原始请求：${original}` : "",
    currentTitle ? `当前任务：${currentTitle}` : "",
    owner ? `执行角色：${owner}` : "",
    category ? `任务类别：${category}` : "",
    skills.length ? `建议技能：${skills.join(", ")}` : "",
    deliverables.length ? `当前交付物：${deliverables.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function getRoleToolAllowlist(owner: string) {
  const normalized = owner || "executor";
  if (normalized === "research") {
    return [
      "Task",
      "Read",
      "Glob",
      "ListTabs",
      "GetPageContext",
      "WebSearch",
      "WebFetch",
    ];
  }
  if (normalized === "automation") {
    return [
      "Task",
      "ListTabs",
      "ActivateTab",
      "GotoPage",
      "NewTab",
      "RunDomActions",
      "EvalInPage",
      "GetPageContext",
    ];
  }
  if (normalized === "review" || normalized === "planner") {
    return ["Task"];
  }
  return null;
}

function getCategoryToolAllowlist(category: string) {
  switch (category) {
    case "research":
    case "reasoning":
      return [
        "Task",
        "Read",
        "Glob",
        "ListTabs",
        "GetPageContext",
        "WebSearch",
        "WebFetch",
      ];
    case "automation":
      return [
        "Task",
        "ListTabs",
        "ActivateTab",
        "GotoPage",
        "NewTab",
        "RunDomActions",
        "EvalInPage",
        "GetPageContext",
      ];
    default:
      return null;
  }
}

function resolveCategoryTemperature(category: string, baseTemperature: number) {
  const base =
    typeof baseTemperature === "number" && Number.isFinite(baseTemperature)
      ? baseTemperature
      : 0.2;
  switch (category) {
    case "automation":
      return Math.min(base, 0.1);
    case "research":
      return Math.min(base, 0.2);
    case "reasoning":
      return Math.min(base, 0.3);
    default:
      return base;
  }
}

function notifyRuntime(type: string, payload: unknown) {
  try {
    chrome.runtime
      .sendMessage(payload ? { type, ...payload } : { type })
      .catch(() => {});
  } catch (error) {
    console.warn(`Failed to notify runtime: ${type}`, error);
  }
}

type ToolChoiceMode = "auto" | "none" | "required" | "tool";
type ToolingFlag = "on" | "off" | "auto";

function normalizeTooling(model: AIModelSetting): {
  toolChoice: { mode: ToolChoiceMode; toolName: string };
  strict: ToolingFlag;
  parallelToolCalls: ToolingFlag;
} {
  const tooling = model?.tooling || {};
  const toolChoice = tooling.toolChoice || {};
  const mode =
    toolChoice?.mode === "none" ||
    toolChoice?.mode === "required" ||
    toolChoice?.mode === "tool" ||
    toolChoice?.mode === "auto"
      ? toolChoice.mode
      : "auto";
  return {
    toolChoice: {
      mode,
      toolName:
        typeof toolChoice?.toolName === "string" ? toolChoice.toolName : "",
    },
    strict:
      tooling?.strict === "on" ||
      tooling?.strict === "off" ||
      tooling?.strict === "auto"
        ? tooling.strict
        : "auto",
    parallelToolCalls:
      tooling?.parallelToolCalls === "on" ||
      tooling?.parallelToolCalls === "off" ||
      tooling?.parallelToolCalls === "auto"
        ? tooling.parallelToolCalls
        : "auto",
  };
}

function buildToolChoicePayload(
  model: AIModelSetting,
): ProviderToolChoice | undefined {
  const tooling = normalizeTooling(model);
  const mode = tooling.toolChoice.mode;
  if (mode === "none" || mode === "required") {
    return mode;
  }
  if (mode === "tool") {
    const toolName = tooling.toolChoice.toolName?.trim();
    if (!toolName) return undefined;
    return { type: "function", function: { name: toolName } };
  }
  return undefined;
}

function resolveToolFlag(value: string) {
  if (value === "on") return true;
  if (value === "off") return false;
  return undefined;
}

function normalizeProviderToolCall(
  call: ProviderToolCall,
  index: number,
): ToolCall {
  const id =
    typeof call.id === "string" && call.id ? call.id : `tool-${index + 1}`;
  const name =
    typeof call.function?.name === "string" && call.function.name
      ? call.function.name
      : "unknown";
  const args =
    typeof call.function?.arguments === "string" ? call.function.arguments : "";
  const normalized: ToolCall = {
    id,
    type: "function",
    function: {
      name,
      arguments: args,
    },
  };
  if (call.extra_content) {
    normalized.extra_content = call.extra_content;
  }
  if (typeof call.thought_signature === "string") {
    normalized.thought_signature = call.thought_signature;
  }
  return normalized;
}

function hasPendingTasks(plan?: TaskPlan | null) {
  if (!plan || !plan.tasks.length) return false;
  const isBlocked = (task: TaskItem) => {
    const blockedBy = Array.isArray(task?.blockedBy) ? task.blockedBy : [];
    if (!blockedBy.length) return false;
    return blockedBy.some((id: string) => {
      const blocker = plan.tasks.find((item) => item?.id === id);
      return !blocker || blocker.status !== "done";
    });
  };
  return plan.tasks.some((task) => {
    if (task?.status !== "done" && !isBlocked(task)) return true;
    const deliverables = Array.isArray(task?.deliverables)
      ? task.deliverables
      : [];
    return deliverables.some(
      (deliverable) => deliverable?.status !== "done",
    );
  });
}

function hasUserInputMarker(text: string) {
  return text.toUpperCase().includes(REQUIRE_USER_INPUT_MARKER);
}

function shouldAutoContinue(
  plan: TaskPlan | null | undefined,
  assistantContent: string,
  assistantReasoning: string,
  toolCallCount: number,
) {
  if (!plan) return false;
  if (plan.status === "planning") return false;
  if (!hasPendingTasks(plan)) return false;
  const content =
    typeof assistantContent === "string" ? assistantContent.trim() : "";
  const reasoning =
    typeof assistantReasoning === "string" ? assistantReasoning.trim() : "";
  const combined = [content, reasoning].filter(Boolean).join("\n");
  if (!combined) return true;
  if (hasUserInputMarker(combined)) return false;
  if (
    AUTO_CONTINUE_STOPWORDS.some((keyword) =>
      combined.toLowerCase().includes(keyword),
    )
  ) {
    return false;
  }
  if (
    AUTO_CONTINUE_KEYWORDS.some((keyword) =>
      combined.toLowerCase().includes(keyword),
    )
  ) {
    return true;
  }
  if (toolCallCount > 0) return true;
  return true;
}

function applyContinuationPrompt(messages: Message[], prompt: string) {
  const next = messages.map((msg) => ({ ...msg }));
  const systemIndex = next.findIndex(
    (msg) => msg.role === "system" && msg.metadata?.type === "system_prompt",
  );
  if (systemIndex >= 0) {
    const existing = next[systemIndex];
    next[systemIndex] = {
      ...existing,
      content: [existing.content, prompt].filter(Boolean).join("\n\n"),
    };
    return next;
  }
  next.unshift({
    id: generateId("sys"),
    role: "system",
    content: prompt,
    timestamp: new Date().toISOString(),
    metadata: { type: "system_prompt" },
  });
  return next;
}

export interface ConversationCallConfig {
  provider: AIProviderSetting;
  model: AIModelSetting;
  temperature: number;
  compressImages: boolean;
}

export interface ConversationToolControl {
  listTools: () => Array<{
    name: string;
    description?: string;
    server?: string;
  }>;
  setActiveToolFilter: (toolNames: string[] | null) => void;
}

export interface ConversationToolSelector {
  enabled: boolean;
  selectToolNames: (
    prompt: string,
    tools: Array<{ name: string; description?: string; server?: string }>,
  ) => Promise<string[]>;
}

interface DynamicToolSelection {
  enabled: boolean;
  candidates: Array<{ name: string; description?: string; server?: string }>;
  selectToolNames: ConversationToolSelector["selectToolNames"];
  setActiveToolFilter?: ConversationToolControl["setActiveToolFilter"];
}

export class ConversationAgent {
  /**
   * Ensure each conversation starts with a stable environment/system prompt so
   * the model understands it is running inside a browser extension.
   *
   * Notes:
   * - Stored once per conversation (idempotent).
   * - Timestamp is forced to be earlier than any existing message so it stays
   *   at the top of the chronological history (important when page_context is
   *   inserted during conversation creation).
   */
  private async ensureSystemPrompt(
    conversationId: string,
    includePageContext: boolean,
    options: { superpowerEnabled?: boolean } = {},
  ): Promise<Message | null> {
    const existing = await getMessagesForConversation(conversationId, 1000);
    const alreadyExists = existing.some(
      (msg) => msg.role === "system" && msg.metadata?.type === "system_prompt",
    );
    if (alreadyExists) return null;

    const nowDate = new Date();
    let timeZone = "UTC";
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      timeZone = "UTC";
    }
    const offsetMinutes = -nowDate.getTimezoneOffset();
    const absOffsetMinutes = Math.abs(offsetMinutes);
    const offsetSign = offsetMinutes >= 0 ? "+" : "-";
    const offsetHours = String(Math.floor(absOffsetMinutes / 60)).padStart(
      2,
      "0",
    );
    const offsetMins = String(absOffsetMinutes % 60).padStart(2, "0");
    const utcOffset = `UTC${offsetSign}${offsetHours}:${offsetMins}`;
    const injectedAtLocal = (() => {
      try {
        const parts = new Intl.DateTimeFormat("zh-CN", {
          timeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).formatToParts(nowDate);
        const map: Record<string, string> = {};
        for (const part of parts) {
          if (part.type !== "literal") {
            map[part.type] = part.value;
          }
        }
        const datePart = `${map.year || "0000"}-${map.month || "00"}-${map.day || "00"}`;
        const timePart = `${map.hour || "00"}:${map.minute || "00"}:${map.second || "00"}`;
        return `${datePart} ${timePart}`;
      } catch {
        return nowDate.toLocaleString("zh-CN", { hour12: false });
      }
    })();

    const hasSavedPageContext = existing.some(
      (msg) =>
        msg.metadata?.type === "page_context" ||
        (msg.role === "system" &&
          typeof msg.content === "string" &&
          msg.content.startsWith("页面上下文:")),
    );

    const injectedAt = nowDate.toISOString();
    const now = Date.now();
    const earliestTsMs = existing.reduce((min, msg) => {
      const value = Date.parse(msg.timestamp);
      return Number.isFinite(value) ? Math.min(min, value) : min;
    }, now);
    const timestamp = new Date(Math.max(0, earliestTsMs - 1)).toISOString();

    let superpowerEnabled = false;
    if (typeof options.superpowerEnabled === "boolean") {
      superpowerEnabled = options.superpowerEnabled;
    } else {
      try {
        const settings = await readSettings();
        superpowerEnabled = Boolean(
          settings?.aiAgents?.conversation?.superpowerMode,
        );
      } catch {
        superpowerEnabled = false;
      }
    }
    let skillBlock = "";
    if (superpowerEnabled) {
      try {
        const skills = await listSkills();
        const enabledSkills = skills.filter((skill) => skill.enabled);
        skillBlock = buildSkillListBlock(
          enabledSkills.map((skill) => ({
            name: skill.name,
            description: skill.description,
          })),
        );
      } catch {
        skillBlock = "";
      }
    }

    const baseLines = [
      "你是浏览器智能助理，运行于 Chrome Extension / MV3。",
      "优先用工具获取事实；需要最新信息时使用 WebSearch/WebFetch。",
      `当前时间: ${injectedAtLocal} (${timeZone}, ${utcOffset})`,
      `本次对话创建时是否启用网页上下文: ${includePageContext ? "是" : "否"}`,
      `当前线程是否已保存网页上下文: ${hasSavedPageContext ? "是" : "否"}`,
    ];

    const superpowerLines = superpowerEnabled
      ? [
          "Superpower Mode 已启用：可控制标签页与页面元素。",
          `只有在确需用户输入时才可提问，且问题前必须输出 ${REQUIRE_USER_INPUT_MARKER}。`,
          "截图成本高，仅在必要时使用。",
          "必须使用 Task 跟踪任务与交付物。",
          "Superpower Mode 默认启用全部技能，可用 Read 访问 /skills/。",
          "优先遵循 /skills/browser-operations/SKILL.md。",
          "EvalInPage 可能受 CSP 限制，失败时改用 RunDomActions / GetPageContext。",
          skillBlock,
        ]
      : [];

    const systemPrompt: Message = {
      id: generateId("sys"),
      conversationId,
      role: "system",
      content: [...baseLines, ...superpowerLines].join("\n"),
      timestamp,
      metadata: {
        type: "system_prompt",
        injectedAt,
        injectedAtLocal,
        timeZone,
        utcOffset,
        utcOffsetMinutes: offsetMinutes,
        includePageContextAtCreation: includePageContext,
        hasSavedPageContext,
      },
    };

    await saveMessage(systemPrompt);
    this.notifyNewMessage(conversationId, systemPrompt);
    return systemPrompt;
  }

  private notifyNewMessage(conversationId: string | null, message: Message) {
    notifyRuntime("myz:newMessage", {
      data: {
        conversationId,
        message,
      },
    });
  }

  private notifyStreamStart(conversationId: string, message: Partial<Message>) {
    notifyRuntime("myz:aiStreamStart", {
      data: {
        conversationId,
        message,
      },
    });
  }

  private notifyStreamDelta(
    conversationId: string,
    payload: MessageStreamData,
  ) {
    notifyRuntime("myz:aiStreamChunk", {
      data: {
        conversationId,
        ...payload,
      },
    });
  }

  private notifyStreamComplete(
    conversationId: string,
    payload: MessageStreamData,
  ) {
    notifyRuntime("myz:aiStreamComplete", {
      data: {
        conversationId,
        ...payload,
      },
    });
  }

  private notifyStreamError(
    conversationId: string,
    payload: MessageStreamData,
  ) {
    notifyRuntime("myz:aiStreamError", {
      data: {
        conversationId,
        ...payload,
      },
    });
  }

  private async getConversationMessages(
    conversationId: string,
    includePageContext = true,
  ): Promise<Message[]> {
    let messages = await getMessagesForConversation(conversationId, 1000);

    messages = messages.filter((msg) => msg.metadata?.type !== "system_event");

    if (!includePageContext) {
      messages = messages.filter(
        (msg) =>
          msg.metadata?.type !== "page_context" &&
          (msg.role !== "system" || msg.metadata?.type === "system_prompt"),
      );
    }

    if (messages.length === 0) {
      const legacy = await readAiConversations();
      const conv = legacy?.conversations?.[conversationId];
      if (conv?.messages?.length) {
        const legacyMessages = includePageContext
          ? conv.messages
          : conv.messages.filter(
              (msg: Message) =>
                msg.role !== "system" || msg.metadata?.type === "system_prompt",
            );
        return legacyMessages;
      }
    }

    return messages;
  }

  private async persistToolCallMessage(
    conversationId: string | null,
    action: string,
    message: ProviderMessage,
    callConfig: ConversationCallConfig,
  ) {
    if (!conversationId) return;
    if (!message?.tool_calls || !message.tool_calls.length) return;

    const toolCallDetails = message.tool_calls.map((call, index: number) => ({
      id: call.id || `tool-${index + 1}`,
      name: call.function?.name || "unknown",
      arguments: call.function?.arguments || "",
    }));
    const toolNames = toolCallDetails.map((detail) => detail.name);
    const normalizedToolCalls = message.tool_calls.map(normalizeProviderToolCall);
    const { content: normalizedContent, reasoning: reasoningContent } =
      normalizeMessagePayload(message);

    const toolCallMessage: Message = {
      id: generateId(),
      conversationId,
      role: "assistant",
      content: normalizedContent || "",
      tool_calls: normalizedToolCalls,
      timestamp: new Date().toISOString(),
      metadata: {
        model: callConfig.model.model,
        providerId: callConfig.provider.id,
        providerName: callConfig.provider.name,
        action,
        hasToolCalls: true,
        toolCallCount: message.tool_calls.length,
        toolNames,
        toolCallDetails,
        ...(reasoningContent ? { reasoning: reasoningContent } : {}),
      },
    };
    if (reasoningContent) {
      toolCallMessage.reasoning_content = reasoningContent;
    }

    await saveMessage(toolCallMessage);
    this.notifyNewMessage(conversationId, toolCallMessage);
  }

  private async persistToolResultMessage(
    conversationId: string | null,
    message: ProviderMessage,
  ) {
    if (!conversationId) return;
    if (message?.role !== "tool") return;

    const persisted: Message = {
      id: generateId(),
      conversationId,
      role: "tool",
      content: typeof message.content === "string" ? message.content : "",
      tool_call_id: message.tool_call_id,
      timestamp: new Date().toISOString(),
      metadata: {
        ...(message.metadata || {}),
      },
    };

    await saveMessage(persisted);
    this.notifyNewMessage(conversationId, persisted);
  }

  async processConversation(
    conversationId: string,
    action: string,
    content: string,
    options: ProcessConversationOptions = {},
    deps: {
      client: ChatCompletionClient;
      isEnabled: boolean;
      callConfig: ConversationCallConfig;
      toolControl?: ConversationToolControl;
      toolSelector?: ConversationToolSelector;
    },
  ): Promise<ProcessConversationResult> {
    if (!deps.isEnabled) {
      throw new Error("AI Assistant is not enabled");
    }

    const {
      includePageContext = true,
      metadata = {},
      attachments = [],
      stream = false,
      streamId,
      ...restOptions
    } = options;

    const normalizedAttachments = Array.isArray(attachments)
      ? attachments.filter(
          (item) =>
            item?.type === "image" &&
            typeof item?.dataUrl === "string" &&
            item.dataUrl,
        )
      : [];

    if (
      normalizedAttachments.length > 0 &&
      !deps.callConfig.model.capabilities.vision
    ) {
      throw new Error("当前模型不支持 Vision，无法发送图片");
    }

    const conversationSnapshot = await getConversation(conversationId);
    const requestedMode =
      typeof options.conversationMode === "string"
        ? normalizeConversationMode(options.conversationMode)
        : null;
    const storedMode =
      typeof conversationSnapshot?.metadata?.assistantMode === "string"
        ? normalizeConversationMode(
            conversationSnapshot?.metadata?.assistantMode,
          )
        : null;
    const conversationMode = requestedMode || storedMode || "agent";

    let superpowerEnabled = false;
    try {
      const settings = await readSettings();
      superpowerEnabled = Boolean(
        settings?.aiAgents?.conversation?.superpowerMode,
      );
    } catch {
      superpowerEnabled = false;
    }
    if (conversationMode === "chat") {
      superpowerEnabled = false;
    }

    const injectedSystemPrompt = await this.ensureSystemPrompt(
      conversationId,
      includePageContext,
      { superpowerEnabled },
    );

    const requiredToolNames = Array.isArray(options.requiredToolNames)
      ? options.requiredToolNames
          .map((name) => (typeof name === "string" ? name.trim() : ""))
          .filter(Boolean)
      : [];

    let dynamicToolSelection: DynamicToolSelection | null = null;
    if (deps.toolControl) {
      deps.toolControl.setActiveToolFilter(null);
      if (deps.toolSelector?.enabled) {
        try {
          const allTools = deps.toolControl.listTools() || [];
          const availableToolNames = new Set(
            allTools
              .map((tool) =>
                typeof tool?.name === "string" ? tool.name.trim() : "",
              )
              .filter(Boolean),
          );
          const toolCandidates = allTools
            .filter((tool) => tool?.name && tool.name !== "SelectTools")
            .map((tool) => ({
              name: tool?.name || "",
              description: tool?.description || "",
              server: tool?.server || "",
            }));

          const selected = await deps.toolSelector.selectToolNames(
            content,
            toolCandidates,
          );
          const normalizedRequired = requiredToolNames.filter((name) =>
            availableToolNames.has(name),
          );
          const activeToolNames =
            selected.length > 0 || normalizedRequired.length > 0
              ? Array.from(
                  new Set(["SelectTools", ...selected, ...normalizedRequired]),
                )
              : ["SelectTools"];
          deps.toolControl.setActiveToolFilter(activeToolNames);

          dynamicToolSelection = {
            enabled: true,
            candidates: toolCandidates,
            selectToolNames: deps.toolSelector.selectToolNames,
            setActiveToolFilter: deps.toolControl.setActiveToolFilter,
          };
        } catch (error) {
          console.warn(
            "Tool selection failed, disabling tools for this request",
            error,
          );
          if (requiredToolNames.length > 0) {
            deps.toolControl.setActiveToolFilter(
              Array.from(new Set(["SelectTools", ...requiredToolNames])),
            );
          } else {
            deps.toolControl.setActiveToolFilter([]);
          }
        }
      }
    }

    // Build the payload history before persisting the new user message so we
    // don't depend on IndexedDB write visibility timing.
    const historyMessages = await this.getConversationMessages(
      conversationId,
      includePageContext,
    );
    const historyHasSystemPrompt = historyMessages.some(
      (msg) => msg.role === "system" && msg.metadata?.type === "system_prompt",
    );

    const userMessage: Message = {
      id: generateId(),
      conversationId,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
      metadata: {
        action,
        ...metadata,
        ...(normalizedAttachments.length
          ? { attachments: normalizedAttachments }
          : {}),
      },
    };
    await saveMessage(userMessage);

    const payloadMessages: Message[] = [];
    if (!historyHasSystemPrompt && injectedSystemPrompt) {
      payloadMessages.push(injectedSystemPrompt);
    }
    payloadMessages.push(...historyMessages, userMessage);

    const conversation =
      conversationSnapshot || (await getConversation(conversationId));
    const taskPlan = normalizeTaskPlanPayload(conversation?.metadata?.taskPlan);
    let skillBlock = "";
    if (superpowerEnabled) {
      try {
        const skills = await listSkills();
        const enabledSkills = skills.filter((skill) => skill.enabled);
        skillBlock = buildSkillListBlock(
          enabledSkills.map((skill) => ({
            name: skill.name,
            description: skill.description,
          })),
        );
      } catch {
        skillBlock = "";
      }
    }

    const shouldExecuteTasks =
      superpowerEnabled &&
      taskPlan &&
      ["executing", "needs_rework"].includes(taskPlan.status);
    const currentTask = shouldExecuteTasks ? getCurrentTask(taskPlan) : null;
    const owner =
      typeof currentTask?.owner === "string" ? currentTask.owner : "";
    const category =
      typeof currentTask?.category === "string" ? currentTask.category : "";
    const categoryTemperature = shouldExecuteTasks
      ? resolveCategoryTemperature(category, deps.callConfig.temperature)
      : null;
    if (shouldExecuteTasks && deps.toolControl) {
      const allowlist = getRoleToolAllowlist(owner);
      const categoryAllowlist = getCategoryToolAllowlist(category);
      let filtered: string[] | null = null;
      if (allowlist && categoryAllowlist) {
        const intersection = allowlist.filter((name) =>
          categoryAllowlist.includes(name),
        );
        filtered = intersection.length ? intersection : allowlist;
      } else if (categoryAllowlist) {
        filtered = categoryAllowlist;
      } else if (allowlist) {
        filtered = allowlist;
      }

      if (filtered) {
        const available = new Set(
          (deps.toolControl.listTools?.() || [])
            .map((tool) => (typeof tool?.name === "string" ? tool.name : ""))
            .filter(Boolean),
        );
        deps.toolControl.setActiveToolFilter(
          filtered.filter((name) => available.has(name)),
        );
      } else {
        deps.toolControl.setActiveToolFilter(null);
      }
    }
    if (shouldExecuteTasks) {
      const directive = buildTaskExecutionDirective(taskPlan);
      if (directive) {
        for (let i = payloadMessages.length - 1; i >= 0; i -= 1) {
          const message = payloadMessages[i];
          if (message?.role === "user") {
            const baseText =
              typeof message.content === "string" ? message.content : "";
            payloadMessages[i] = {
              ...message,
              content: [baseText, directive].filter(Boolean).join("\n\n"),
            };
            break;
          }
        }
      }
    }

    if (superpowerEnabled && !taskPlan) {
      const systemPromptIndex = payloadMessages.findIndex(
        (msg) =>
          msg.role === "system" && msg.metadata?.type === "system_prompt",
      );
      const superpowerPrompt = [
        "Superpower Mode 已启用。",
        "必须使用 Task 跟踪任务与交付物。",
        '调用 Task 时必须提供 action 字段，例如 {"action":"get"}。',
        `仅在确需用户输入时提问，且问题前必须输出 ${REQUIRE_USER_INPUT_MARKER}。`,
        "默认启用全部技能，可用 Read 访问 /skills/。",
        "优先遵循 /skills/browser-operations/SKILL.md。",
        "截图用 RunDomActions.captureViewport，谨慎使用。",
        "EvalInPage 受 CSP 限制时改用 RunDomActions / GetPageContext。",
        skillBlock,
      ].join("\n");
      if (systemPromptIndex >= 0) {
        const existingPrompt = payloadMessages[systemPromptIndex];
        const existingContent = String(existingPrompt.content || "");
        const needsSuperpowerPrompt =
          !existingContent.includes("Superpower Mode");
        const needsSkillBlock =
          Boolean(skillBlock) &&
          !existingContent.includes("<available_skills>");
        const additions: string[] = [];
        if (needsSuperpowerPrompt) {
          additions.push(superpowerPrompt);
        } else if (needsSkillBlock) {
          additions.push(skillBlock);
        }
        payloadMessages[systemPromptIndex] = {
          ...existingPrompt,
          content: additions.length
            ? [existingContent, ...additions].filter(Boolean).join("\n\n")
            : existingPrompt.content,
        };
      } else {
        payloadMessages.unshift({
          id: generateId("sys"),
          conversationId,
          role: "system",
          content: superpowerPrompt,
          timestamp: new Date().toISOString(),
          metadata: { type: "system_prompt" },
        });
      }
    }
    if (shouldExecuteTasks) {
      const taskPlanPrompt = [
        "Superpower Mode 已启用。",
        "任务计划是唯一执行依据；严格按顺序执行。",
        "开始执行前必须 Task.get 获取完整任务列表。",
        '调用 Task 时必须提供 action 字段，例如 {"action":"get"}。',
        "需要工具时必须实际发起 tool call，不得只描述。",
        `仅在确需用户输入时提问，且问题前必须输出 ${REQUIRE_USER_INPUT_MARKER}。`,
        "默认启用全部技能，可用 Read 访问 /skills/。",
        "优先遵循 /skills/browser-operations/SKILL.md。",
        "截图用 RunDomActions.captureViewport，谨慎使用。",
        "EvalInPage 受 CSP 限制时改用 RunDomActions / GetPageContext。",
        skillBlock,
      ].join("\n");
      const systemPromptIndex = payloadMessages.findIndex(
        (msg) =>
          msg.role === "system" && msg.metadata?.type === "system_prompt",
      );
      if (systemPromptIndex >= 0) {
        const existingPrompt = payloadMessages[systemPromptIndex];
        const existingContent = String(existingPrompt.content || "");
        const needsSkillBlock =
          Boolean(skillBlock) &&
          !existingContent.includes("<available_skills>");
        const promptText = needsSkillBlock
          ? taskPlanPrompt
          : taskPlanPrompt.replace(skillBlock, "").trim();
        payloadMessages[systemPromptIndex] = {
          ...existingPrompt,
          content: [existingPrompt.content, promptText]
            .filter(Boolean)
            .join("\n\n"),
        };
      } else {
        payloadMessages.unshift({
          id: generateId("sys"),
          conversationId,
          role: "system",
          content: taskPlanPrompt,
          timestamp: new Date().toISOString(),
          metadata: { type: "system_prompt" },
        });
      }
    }
    const runCompletion = async (options: {
      messages: Message[];
      stream: boolean;
      streamId?: string;
      extraMetadata?: JsonRecord;
    }) => {
      const historyPayload: MessageInPayload[] =
        injectSystemPromptAsUserMessage(
          buildConversationPromptMessages(options.messages, {
            includeVision: deps.callConfig.model.capabilities.vision,
          }),
          Boolean(deps.callConfig.model?.systemPromptInUserMessage),
        );

      let streamMessageId: string | null = null;
      if (options.stream) {
        const startedStreamId = options.streamId || generateId("stream");
        streamMessageId = startedStreamId;
        this.notifyStreamStart(conversationId, {
          id: startedStreamId,
          role: "assistant",
          content: "",
          timestamp: new Date().toISOString(),
          metadata: {
            model: deps.callConfig.model.model,
            providerId: deps.callConfig.provider.id,
            providerName: deps.callConfig.provider.name,
            action,
            streaming: true,
          },
        });
      }

      const model = deps.callConfig.model.model;
      const maxOutputTokens = deps.callConfig.model.limits.maxOutputTokens;
      const maxOutputTokenParam: MaxOutputTokenParam =
        deps.callConfig.model.limits.maxOutputTokenParam;
      const temperature = deps.callConfig.temperature;
      const requestStartedAt = Date.now();
      const tooling = deps.toolControl
        ? normalizeTooling(deps.callConfig.model)
        : null;
      const toolChoicePayload = deps.toolControl
        ? buildToolChoicePayload(deps.callConfig.model)
        : undefined;
      const strictFlag = tooling ? resolveToolFlag(tooling.strict) : undefined;
      const parallelFlag = tooling
        ? resolveToolFlag(tooling.parallelToolCalls)
        : undefined;
      const toolingOverrides = deps.toolControl
        ? {
            ...(toolChoicePayload ? { toolChoice: toolChoicePayload } : {}),
            ...(typeof strictFlag === "boolean" ? { strict: strictFlag } : {}),
            ...(typeof parallelFlag === "boolean"
              ? { parallelToolCalls: parallelFlag }
              : {}),
          }
        : undefined;
      const toolingOption =
        toolingOverrides && Object.keys(toolingOverrides).length
          ? toolingOverrides
          : undefined;

      let response: ProviderChatCompletionResponse | null = null;
      try {
        const requestTemperature =
          typeof restOptions.temperature === "number"
            ? restOptions.temperature
            : typeof categoryTemperature === "number"
              ? categoryTemperature
              : temperature;
        const request: ProviderChatCompletionRequest = {
          model,
          messages: historyPayload,
          temperature: requestTemperature,
          stream: options.stream,
        };
        if (maxOutputTokenParam === "max_completion_tokens") {
          request.max_completion_tokens = maxOutputTokens;
        } else {
          request.max_tokens = maxOutputTokens;
        }

        const completionOptions: ProviderStreamOptions & {
          dynamicToolSelection?: DynamicToolSelection | null;
        } = {
          enableGeminiThinking: Boolean(
            deps.callConfig.model.capabilities.reasoning,
          ),
          dynamicToolSelection,
          ...(toolingOption ? { tooling: toolingOption } : {}),
          onStreamDelta: options.stream
            ? (delta: ProviderStreamDelta) => {
                if (!delta) return;
                const deltaText =
                  typeof delta.content === "string"
                    ? delta.content
                    : isRecord(delta) && typeof delta.delta === "string"
                      ? delta.delta
                      : "";
                const reasoning =
                  typeof delta.reasoning === "string" ? delta.reasoning : "";
                if (!deltaText && !reasoning) {
                  return;
                }
                const payload: MessageStreamData = {
                  streamId: streamMessageId,
                  delta: deltaText,
                  reasoning,
                };
                this.notifyStreamDelta(conversationId, payload);
              }
            : undefined,
          onToolCallMessage: async (message: ProviderMessage) =>
            this.persistToolCallMessage(
              conversationId,
              action,
              message,
              deps.callConfig,
            ),
          onToolResultMessage: async (message: ProviderMessage) =>
            this.persistToolResultMessage(conversationId, message),
        };
        response = await deps.client.createCompletion(request, completionOptions);
      } catch (error) {
        if (options.stream && streamMessageId) {
          const errorPayload: MessageStreamData = {
            streamId: streamMessageId,
            error: (error as Error).message,
          };
          this.notifyStreamError(conversationId, errorPayload);
        }
        throw error;
      } finally {
        if (deps.toolControl) {
          deps.toolControl.setActiveToolFilter(null);
        }
      }

      const message = response?.choices?.[0]?.message;
      const usage = isRecord(response?.usage)
        ? toJsonRecord(response?.usage)
        : null;
      const requestCompletedAt = Date.now();
      const requestDurationMs = Math.max(
        0,
        requestCompletedAt - requestStartedAt,
      );
      const { content: normalizedContent, reasoning: reasoningContent } =
        normalizeMessagePayload(message);
      let assistantContent = normalizedContent || "";

      let toolNamesList: string[] = [];
      let toolCallDetails: ToolInvocationDetails[] = [];
      const assistantHadContent = Boolean(
        (normalizedContent || "").trim() || (reasoningContent || "").trim(),
      );

      let normalizedToolCalls: ToolCall[] | undefined;
      if (message?.tool_calls && message.tool_calls.length > 0) {
        toolNamesList = message.tool_calls.map(
          (call) => call.function?.name || "unknown",
        );
        toolCallDetails = message.tool_calls.map(
          (call, index: number) => ({
            id: call.id || `tool-${index + 1}`,
            name: call.function?.name || "unknown",
            arguments: call.function?.arguments || "",
          }),
        );
        normalizedToolCalls = message.tool_calls.map(normalizeProviderToolCall);
      }

      const assistantMessage: Message = {
        id: generateId(),
        conversationId,
        role: "assistant",
        content: assistantContent,
        ...(normalizedToolCalls ? { tool_calls: normalizedToolCalls } : {}),
        timestamp: new Date().toISOString(),
        metadata: {
          model: deps.callConfig.model.model,
          providerId: deps.callConfig.provider.id,
          providerName: deps.callConfig.provider.name,
          action,
          hasToolCalls: !!message?.tool_calls,
          toolCallCount: message?.tool_calls?.length || 0,
          toolNames: toolNamesList,
          toolCallDetails,
          toolInvocationOnly: !assistantHadContent && toolNamesList.length > 0,
          reasoning: reasoningContent || undefined,
          includePageContext,
          contextWindow: deps.callConfig.model.limits.contextWindow,
          requestStartedAt,
          requestCompletedAt,
          requestDurationMs,
          ...(usage ? { usage } : {}),
          ...metadata,
          ...(options.extraMetadata || {}),
        },
      };
      if (reasoningContent) {
        assistantMessage.reasoning_content = reasoningContent;
      }

      await saveMessage(assistantMessage);

      if (options.stream && streamMessageId) {
        const completePayload: MessageStreamData = {
          streamId: streamMessageId,
          content: assistantContent,
          reasoning: reasoningContent || "",
          metadata: {
            toolNames: toolNamesList,
            toolCallDetails,
            reasoning: reasoningContent || "",
            contextWindow: deps.callConfig.model.limits.contextWindow,
            requestStartedAt,
            requestCompletedAt,
            requestDurationMs,
            ...(usage ? { usage } : {}),
          },
          message: assistantMessage,
        };
        this.notifyStreamComplete(conversationId, completePayload);
      } else {
        this.notifyNewMessage(conversationId, assistantMessage);
      }

      return {
        conversationId,
        content: assistantContent,
        reasoning: reasoningContent || "",
        model: deps.callConfig.model.model,
        timestamp: assistantMessage.timestamp,
        hasToolCalls: !!message?.tool_calls,
        toolCallCount: message?.tool_calls?.length || 0,
      };
    };

    let finalResult = await runCompletion({
      messages: payloadMessages,
      stream,
      streamId,
    });

    if (superpowerEnabled) {
      let autoContinueTurns = 0;
      while (autoContinueTurns < AUTO_CONTINUE_MAX_TURNS) {
        const latestConversation = await getConversation(conversationId);
        const latestPlan = normalizeTaskPlanPayload(
          latestConversation?.metadata?.taskPlan,
        );
        if (
          !shouldAutoContinue(
            latestPlan,
            finalResult.content,
            finalResult.reasoning,
            finalResult.toolCallCount || 0,
          )
        ) {
          break;
        }

        const continuationPrompt = [
          "继续执行任务，不要等待用户输入。",
          "如需工具，立即发起 tool call，并及时更新任务与交付物状态。",
          "当前任务计划概要:",
          buildTaskPlanSummary(latestPlan),
        ].join("\n");

        const historyMessages = await this.getConversationMessages(
          conversationId,
          includePageContext,
        );
        const continuationMessages = applyContinuationPrompt(
          historyMessages,
          continuationPrompt,
        );

        autoContinueTurns += 1;
        finalResult = await runCompletion({
          messages: continuationMessages,
          stream: false,
          extraMetadata: { autoContinueTurn: autoContinueTurns },
        });
      }
    }

    return finalResult;
  }
}
