import {
  createConversation,
  exportConversation,
  getConversationHistory,
  listConversations,
  readAiConversations,
  saveAiGeneratedHighlight,
  writeAiConversations,
} from "../ai";
import {
  AutoHighlightAgent,
  type AutoHighlightResult,
} from "../ai/agents/autoHighlightAgent.js";
import { ConversationAgent } from "../ai/agents/conversationAgent.js";
import { ConversationTitleAgent } from "../ai/agents/conversationTitleAgent.js";
import { InsightsAgent } from "../ai/agents/insightsAgent.js";
import { PlanningAgent } from "../ai/agents/planningAgent.js";
import { SkillSelectionAgent } from "../ai/agents/skillSelectionAgent.js";
import { ToolSelectionAgent } from "../ai/agents/toolSelectionAgent.js";
import { McpCapability } from "../ai/capabilities/mcp.js";
import {
  fetchProviderModels,
  testProviderConnection,
} from "../ai/providers/registry.js";
import {
  resolveAgentTarget,
  resolveConversationMultimodalTarget,
  resolveModelRef,
} from "../ai/runtime/agentSelection.js";
import type {
  ChatCompletionClient,
  ProviderChatCompletionRequest,
} from "../ai/providers/types.js";
import type {
  ImageAttachment,
  Message,
  PageInsightPayload,
  ProcessConversationOptions,
} from "../ai/types.js";
import { testMcpConnection } from "../mcp";
import type { ToolWithServer } from "../ai/tools/registry.js";
import type {
  AIProviderSetting,
  MaxOutputTokenParam,
  McpServerSetting,
} from "../settings";
import type { Settings } from "../settings";
import { generateId, readSettings, saveHighlight } from "../storage";
import { isRecord } from "@/shared/typeUtils";
import { registerMessageHandler } from "./handler";
import { MyZRecord, RECORD_KINDS } from "@/shared/types";
import {
  deleteConversation,
  getConversation,
  getMessagesForConversation,
  replaceConversationMessages,
  updateConversationMetadata,
  saveConversation,
} from "@/sidepanel/aiStorage";
import { recordConversationDeletion } from "../sync/deletions";
import { acquireProviderRuntime } from "../ai/runtime/providerRuntime.js";
import { QuickStartAgent } from "../ai/agents/quickStartAgent.js";
import { PlanReviewAgent } from "../ai/agents/planReviewAgent.js";
import { ValidatorAgent } from "../ai/agents/validatorAgent.js";
import {
  getTaskPlan,
  initTaskPlan,
  startTaskPlanExecution,
  TaskPlanReview,
  updatePlanReviewResult,
  updateValidationResult,
} from "../ai/tasks/taskManager.js";
import {
  LOCAL_TOOL_NAMES,
  SUPERPOWER_TOOL_NAMES,
} from "../ai/tools/localDefinitions.js";
import { extractSkillMentions } from "../ai/skills/mentions.js";
import { listSkills } from "../ai/skills/storage.js";

export interface AIProviderFetchModelsMessageResult {
  models: string[];
}

export interface AIProviderTestConnectionMessageResult {
  success: boolean;
  response?: string;
  error?: string;
}

export interface GeneratePageInsightsMessageResult {
  success: boolean;
  action: "summarize" | "key_points";
  markdown: string;
  raw: string[];
  chunkGroups: number;
  generatedAt: string;
}

export interface GenerateAutoHighlightsMessageResult extends AutoHighlightResult {
  categoryStyles?: unknown;
}

export interface TestMcpConnectionMessageResult {
  success: boolean;
  tools?: ToolWithServer[];
  resources?: unknown[];
  error?: string;
}

export interface ListMcpToolsMessageResult {
  tools: ToolWithServer[];
}

/**
 * Stores a "draft action" so the SidePanel can pick it up even if the runtime
 * message fires before the SidePanel page is ready.
 */
const PENDING_SIDEPANEL_ACTION_KEY = "myz::pendingSidePanelAction";
const DEFAULT_CONTEXT_COMPACTION_RECENT_COUNT = 10;

function generateDraftId(prefix = "draft") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeConversationMode(value: unknown): "agent" | "chat" | null {
  if (value === "chat") return "chat";
  if (value === "agent") return "agent";
  return null;
}

function resolveConversationMode(
  requested: unknown,
  stored: unknown,
): "agent" | "chat" {
  return (
    normalizeConversationMode(requested) ||
    normalizeConversationMode(stored) ||
    "agent"
  );
}

function supportsProviderStreaming(provider: AIProviderSetting) {
  if (provider?.streamingEnabled === false) return false;
  switch (provider?.type) {
    case "openai_compatible":
    case "openai_responses":
    case "gemini":
    case "anthropic":
    case "moonshot":
    case "qwen":
    case "vllm":
    case "llama_cpp":
    case "ollama":
      return true;
    default:
      return false;
  }
}

function buildPreflightTask(review?: {
  issues?: string[];
  missingInfo?: string[];
}) {
  const issues = Array.isArray(review?.issues) ? review?.issues : [];
  const missingInfo = Array.isArray(review?.missingInfo)
    ? review?.missingInfo
    : [];
  const deliverables = [...issues, ...missingInfo]
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .map((item) => ({ description: `补齐/确认：${item}` }));
  if (deliverables.length === 0) {
    deliverables.push({ description: "补齐目标、约束、验收标准或账号权限" });
  }
  return {
    title: "补齐执行前提与关键信息",
    deliverables,
    priority: "high",
    owner: "executor",
    category: "quick",
  };
}

function notifySidePanel(type: string, data?: unknown) {
  try {
    chrome.runtime
      .sendMessage(data ? { type, data } : { type })
      .catch(() => {});
  } catch (error) {
    console.warn(`Failed to notify sidepanel: ${type}`, error);
  }
}

async function finalizeSkillContext(options: {
  conversationId?: string;
  skills: Array<{ name: string; description?: string }>;
}) {
  if (!options.skills.length) {
    return { skillNames: [], skillList: [] };
  }

  const skillNames = options.skills.map((skill) => skill.name);
  let injectList = options.skills.map((skill) => ({
    name: skill.name,
    description: skill.description || "",
  }));

  const conversationId = options.conversationId;
  if (conversationId) {
    try {
      const conversation = await getConversation(conversationId);
      const injected = Array.isArray(
        conversation?.metadata?.skillContextInjected,
      )
        ? conversation?.metadata?.skillContextInjected
            .map((name) => (typeof name === "string" ? name.trim() : ""))
            .filter(Boolean)
        : [];
      const injectedSet = new Set(injected);
      injectList = injectList.filter((skill) => !injectedSet.has(skill.name));
      if (injectList.length > 0) {
        const nextInjected = Array.from(
          new Set([...injectedSet, ...injectList.map((skill) => skill.name)]),
        );
        await updateConversationMetadata(conversationId, {
          skillContextInjected: nextInjected,
        });
      }
    } catch (error) {
      console.warn("Failed to update skill injection metadata", error);
    }
  }

  return {
    skillNames,
    skillList: injectList,
  };
}

async function resolveSkillContext(options: {
  conversationId?: string;
  message: string;
  settings: Settings;
  forceAllSkills?: boolean;
}) {
  const message = typeof options.message === "string" ? options.message : "";
  const skills = await listSkills();
  const enabledSkills = skills.filter((skill) => skill.enabled);
  if (!enabledSkills.length) {
    return { skillNames: [], skillList: [] };
  }

  if (options.forceAllSkills) {
    return await finalizeSkillContext({
      conversationId: options.conversationId,
      skills: enabledSkills,
    });
  }

  const available = new Set(enabledSkills.map((skill) => skill.name));
  const explicit = extractSkillMentions(message, available);
  const selected = new Set(explicit);

  const skillSettings = options.settings.aiSkills;
  const selectorTarget = skillSettings?.autoSelectorTarget;
  const shouldAutoSelect = skillSettings?.mode === "auto";

  if (
    shouldAutoSelect &&
    selectorTarget?.providerId &&
    selectorTarget?.modelId &&
    message.trim()
  ) {
    try {
      const resolved = resolveModelRef(options.settings, selectorTarget);
      const selectorRuntime = await acquireProviderRuntime(
        resolved.provider,
        [],
      );
      try {
        const selector = new SkillSelectionAgent();
        const autoSelected = await selector.selectSkillNames({
          prompt: message,
          skills: enabledSkills.map((skill) => ({
            name: skill.name,
            description: skill.description,
          })),
          client: selectorRuntime.session.client,
          model: resolved.model,
        });
        autoSelected.forEach((name) => selected.add(name));
      } finally {
        await selectorRuntime.release();
      }
    } catch (error) {
      console.warn("Skill selector failed", error);
    }
  }

  if (!selected.size) {
    return { skillNames: [], skillList: [] };
  }

  const resolved = enabledSkills.filter((skill) => selected.has(skill.name));
  if (!resolved.length) {
    return { skillNames: [], skillList: [] };
  }

  return await finalizeSkillContext({
    conversationId: options.conversationId,
    skills: resolved,
  });
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildUserContextText(message: Message) {
  const baseText = normalizeText(message?.content);
  const selectionContextText = normalizeText(
    message?.metadata?.selectionContextText,
  );
  const parts = [];
  if (selectionContextText) {
    parts.push(`选中内容（上下文）:\n${selectionContextText}`);
  }
  if (baseText) {
    parts.push(baseText);
  }
  return parts.join("\n\n").trim();
}

function formatTranscriptMessage(message: Message) {
  const role = message?.role || "user";
  const label =
    role === "user"
      ? "用户"
      : role === "assistant"
        ? "助手"
        : role === "tool"
          ? "工具"
          : "消息";
  const text =
    role === "user"
      ? buildUserContextText(message)
      : normalizeText(message?.content);
  if (!text) return "";
  return `${label}: ${text}`;
}

function buildCompressionTranscript(messages: Message[]) {
  return (messages || [])
    .map((message) => formatTranscriptMessage(message))
    .filter(Boolean)
    .join("\n\n");
}

function normalizeSummaryMaxTokens(
  model: AIProviderSetting["models"][number],
  targetTokens?: number,
) {
  const modelMax =
    typeof model?.limits?.maxOutputTokens === "number"
      ? model.limits.maxOutputTokens
      : 1024;
  let desired =
    typeof targetTokens === "number" && targetTokens > 0
      ? Math.floor(targetTokens / 16)
      : 512;
  desired = Math.max(256, Math.min(1024, desired));
  return Math.max(64, Math.min(modelMax, desired));
}

async function generateContextSummary(options: {
  messages: Message[];
  client: ChatCompletionClient;
  model: AIProviderSetting["models"][number];
  targetTokens?: number;
}) {
  const transcript = buildCompressionTranscript(options.messages || []);
  if (!transcript) {
    return "";
  }

  const systemPrompt = [
    "你是一个“上下文压缩助手”，负责把对话记录浓缩为可继续对话的摘要。",
    "",
    "要求：",
    "- 聚焦用户目标、关键信息、已做决策、未解决问题、下一步。",
    "- 保留名称、数字、约束、偏好、重要结论。",
    "- 忽略寒暄、重复、无关细节。",
    "- 用中文输出要点列表。",
  ].join("\n");

  const userPrompt = [
    "请根据以下对话记录生成摘要：",
    "",
    transcript,
    "",
    "请输出摘要。",
  ].join("\n");

  const maxOutputTokens = normalizeSummaryMaxTokens(
    options.model,
    options.targetTokens,
  );
  const maxOutputTokenParam: MaxOutputTokenParam =
    options.model?.limits?.maxOutputTokenParam === "max_completion_tokens"
      ? "max_completion_tokens"
      : "max_tokens";

  const request: ProviderChatCompletionRequest = {
    model: options.model.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
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

  return normalizeText(response?.choices?.[0]?.message?.content);
}

/**
 * Prefer session storage to avoid persistence beyond the current browser session.
 * Fall back to local storage if `chrome.storage.session` is unavailable.
 */
async function writePendingSidePanelAction(payload: unknown) {
  try {
    await chrome.storage.session.set({
      [PENDING_SIDEPANEL_ACTION_KEY]: payload,
    });
  } catch {
    await chrome.storage.local.set({ [PENDING_SIDEPANEL_ACTION_KEY]: payload });
  }
}

/**
 * Returns and clears the pending draft action.
 */
async function popPendingSidePanelAction() {
  try {
    const result = await chrome.storage.session.get(
      PENDING_SIDEPANEL_ACTION_KEY,
    );
    await chrome.storage.session.remove(PENDING_SIDEPANEL_ACTION_KEY);
    return result?.[PENDING_SIDEPANEL_ACTION_KEY] || null;
  } catch {
    const result = await chrome.storage.local.get(PENDING_SIDEPANEL_ACTION_KEY);
    await chrome.storage.local.remove(PENDING_SIDEPANEL_ACTION_KEY);
    return result?.[PENDING_SIDEPANEL_ACTION_KEY] || null;
  }
}

/**
 * Clears the pending draft action only if the `draftId` matches (prevents
 * wiping a newer action if the SidePanel is already open).
 */
async function clearPendingSidePanelActionIfMatch(draftId: string) {
  if (!draftId) return;
  const read = async (area: "session" | "local") => {
    const store =
      area === "session" ? chrome.storage.session : chrome.storage.local;
    const result = await store.get(PENDING_SIDEPANEL_ACTION_KEY);
    const current = result?.[PENDING_SIDEPANEL_ACTION_KEY];
    if (current?.draftId && current.draftId === draftId) {
      await store.remove(PENDING_SIDEPANEL_ACTION_KEY);
      return true;
    }
    return false;
  };
  try {
    if (await read("session")) return;
  } catch {}
  try {
    await read("local");
  } catch {}
}

export function initializeAIMessageHandlers() {
  // AI Assistant handlers
  registerMessageHandler(
    "myz:aiProviderFetchModels",
    async (payload: {
      type: AIProviderSetting["type"];
      baseUrl: string;
      apiKey: string;
      headers?: string;
    }) => {
      const { type, baseUrl, apiKey, headers = "" } = payload;
      if (!baseUrl) {
        throw new Error("Base URL is required");
      }
      const models = await fetchProviderModels({
        type,
        baseUrl,
        apiKey,
        headers,
      });
      return { models } satisfies AIProviderFetchModelsMessageResult;
    },
  );

  registerMessageHandler(
    "myz:aiProviderTestConnection",
    async (payload: {
      provider: Pick<
        AIProviderSetting,
        "baseUrl" | "apiKey" | "headers" | "type"
      >;
      model: string;
      maxOutputTokens?: number;
      maxOutputTokenParam?: MaxOutputTokenParam;
    }) => {
      const result = await testProviderConnection(payload);
      return result satisfies AIProviderTestConnectionMessageResult;
    },
  );

  registerMessageHandler(
    "myz:aiPlanRequest",
    async (payload: {
      conversationId: string;
      message?: string;
      options?: {
        quickStart?: boolean;
        autoStart?: boolean;
        selectionContextText?: string;
      };
    }) => {
      const settings = await readSettings();
      if (!settings.aiAssistantEnabled) {
        throw new Error("AI Assistant is not enabled");
      }
      const superpowerEnabled = Boolean(
        settings?.aiAgents?.conversation?.superpowerMode,
      );
      if (!superpowerEnabled) {
        throw new Error("Superpower Mode is not enabled");
      }

      const conversationId = payload?.conversationId;
      const normalizedMessage =
        typeof payload?.message === "string" ? payload.message.trim() : "";
      if (!conversationId) {
        throw new Error("conversationId is required");
      }
      if (!normalizedMessage) {
        throw new Error("message is required");
      }

      const existingPlan = await getTaskPlan(conversationId);
      const quickStart = Boolean(payload?.options?.quickStart);
      const selectionContextText =
        typeof payload?.options?.selectionContextText === "string"
          ? payload.options.selectionContextText.trim()
          : "";
      const baseRequest = selectionContextText
        ? [normalizedMessage, `选中内容:\n${selectionContextText}`]
            .filter(Boolean)
            .join("\n\n")
        : normalizedMessage;
      const originalUserRequest =
        existingPlan?.originalUserRequest || baseRequest;
      const reviewStatus = existingPlan?.planReview?.status;
      const reviewIssues = Array.isArray(existingPlan?.planReview?.issues)
        ? existingPlan?.planReview?.issues
        : [];
      const reviewMissing = Array.isArray(existingPlan?.planReview?.missingInfo)
        ? existingPlan?.planReview?.missingInfo
        : [];
      const isRevision = reviewStatus === "needs_revision";
      const planningPrompt = isRevision
        ? [
            "请根据原始需求与补充信息重新规划任务。",
            "要求：保持原始目标，补齐缺失信息或转为前置任务；输出新的完整任务计划。",
            "",
            `原始需求：${originalUserRequest}`,
            `补充信息：${normalizedMessage}`,
            selectionContextText
              ? `补充选中内容：\n${selectionContextText}`
              : "补充选中内容：无",
            reviewIssues.length
              ? `审核问题：${reviewIssues.join("；")}`
              : "审核问题：无",
            reviewMissing.length
              ? `缺失信息：${reviewMissing.join("；")}`
              : "缺失信息：无",
          ].join("\n")
        : baseRequest;

      const target = resolveAgentTarget(settings, "conversation");
      const runtime = await acquireProviderRuntime(target.provider, []);
      try {
        const planner = quickStart
          ? new QuickStartAgent()
          : new PlanningAgent();
        const result = await planner.createPlan({
          prompt: planningPrompt,
          client: runtime.session.client,
          model: target.model,
        });
        const resultMode =
          isRecord(result) && typeof result.mode === "string"
            ? result.mode
            : undefined;

        let plan = await initTaskPlan({
          conversationId,
          originalUserRequest,
          tasks: result.tasks,
          mode: resultMode,
          assumptions: Array.isArray(result.assumptions)
            ? result.assumptions
            : [],
        });

        const reviewer = new PlanReviewAgent();
        let reviewResult: TaskPlanReview | null = null;
        const reviewPlan = async (currentPlan: typeof plan) => {
          try {
            return await reviewer.review({
              originalUserRequest,
              taskPlan: currentPlan,
              client: runtime.session.client,
              model: target.model,
            });
          } catch (error) {
            console.warn("Plan review failed", error);
            return null;
          }
        };

        reviewResult = await reviewPlan(plan);

        if (reviewResult?.status === "needs_revision") {
          const revisionPrompt = [
            "请根据原始需求、补充信息、现有计划与审核意见重新生成完整任务计划。",
            "要求：不要向用户提问；缺失信息转为前置任务；必要时做合理假设并写入 assumptions。",
            "仅输出 JSON。",
            "",
            `原始需求：${originalUserRequest}`,
            `补充信息：${normalizedMessage}`,
            selectionContextText
              ? `补充选中内容：\n${selectionContextText}`
              : "补充选中内容：无",
            "现有计划：",
            JSON.stringify(
              {
                tasks: plan.tasks,
                assumptions: Array.isArray(plan.assumptions)
                  ? plan.assumptions
                  : [],
              },
              null,
              2,
            ),
            reviewResult.issues?.length
              ? `审核问题：${reviewResult.issues.join("；")}`
              : "审核问题：无",
            reviewResult.missingInfo?.length
              ? `缺失信息：${reviewResult.missingInfo.join("；")}`
              : "缺失信息：无",
          ].join("\n");
          const revised = await planner.createPlan({
            prompt: revisionPrompt,
            client: runtime.session.client,
            model: target.model,
          });
          const revisedMode =
            isRecord(revised) && typeof revised.mode === "string"
              ? revised.mode
              : undefined;
          if (Array.isArray(revised.tasks) && revised.tasks.length > 0) {
            plan = await initTaskPlan({
              conversationId,
              originalUserRequest,
              tasks: revised.tasks,
              mode: revisedMode ?? resultMode,
              assumptions: Array.isArray(revised.assumptions)
                ? revised.assumptions
                : Array.isArray(result.assumptions)
                  ? result.assumptions
                  : [],
            });
            const revisedReview = await reviewPlan(plan);
            if (revisedReview) {
              reviewResult = revisedReview;
            }
          }
        }

        if (reviewResult?.status === "needs_revision") {
          const preflight = buildPreflightTask(reviewResult);
          plan = await initTaskPlan({
            conversationId,
            originalUserRequest,
            tasks: [preflight, ...plan.tasks],
            mode: plan.mode,
            assumptions: Array.isArray(plan.assumptions)
              ? plan.assumptions
              : [],
          });
          reviewResult = { status: "pass", issues: [], missingInfo: [] };
        }

        if (reviewResult) {
          await updatePlanReviewResult({
            conversationId,
            review: reviewResult,
          });
        }

        if (payload?.options?.autoStart && reviewResult?.status === "pass") {
          const started = await startTaskPlanExecution(conversationId);
          if (started) {
            plan = started;
          }
        }

        return { plan, review: reviewResult, result };
      } finally {
        await runtime.release();
      }
    },
  );

  registerMessageHandler(
    "myz:aiValidateRequest",
    async (payload: { conversationId: string }) => {
      const settings = await readSettings();
      if (!settings.aiAssistantEnabled) {
        throw new Error("AI Assistant is not enabled");
      }
      const superpowerEnabled = Boolean(
        settings?.aiAgents?.conversation?.superpowerMode,
      );
      if (!superpowerEnabled) {
        throw new Error("Superpower Mode is not enabled");
      }

      const conversationId = payload?.conversationId;
      if (!conversationId) {
        throw new Error("conversationId is required");
      }

      const plan = await getTaskPlan(conversationId);
      if (!plan) {
        throw new Error("No task plan found for this conversation");
      }
      if (plan.planReview?.status !== "pass") {
        throw new Error("Plan review has not passed yet");
      }
      const allDone = plan.tasks.every((task) => task.status === "done");
      if (!allDone) {
        throw new Error("Tasks are not completed yet");
      }

      const target = resolveAgentTarget(settings, "conversation");
      const runtime = await acquireProviderRuntime(target.provider, []);
      try {
        const validator = new ValidatorAgent();
        const result = await validator.validate({
          originalUserRequest: plan.originalUserRequest,
          taskPlan: plan,
          client: runtime.session.client,
          model: target.model,
        });
        await updateValidationResult({ conversationId, validation: result });
        return result;
      } finally {
        await runtime.release();
      }
    },
  );

  registerMessageHandler(
    "myz:aiPlanReviewRequest",
    async (payload: { conversationId: string }) => {
      const settings = await readSettings();
      if (!settings.aiAssistantEnabled) {
        throw new Error("AI Assistant is not enabled");
      }
      const superpowerEnabled = Boolean(
        settings?.aiAgents?.conversation?.superpowerMode,
      );
      if (!superpowerEnabled) {
        throw new Error("Superpower Mode is not enabled");
      }

      const conversationId = payload?.conversationId;
      if (!conversationId) {
        throw new Error("conversationId is required");
      }
      const plan = await getTaskPlan(conversationId);
      if (!plan) {
        throw new Error("No task plan found for this conversation");
      }

      const target = resolveAgentTarget(settings, "conversation");
      const runtime = await acquireProviderRuntime(target.provider, []);
      try {
        const reviewer = new PlanReviewAgent();
        const review = await reviewer.review({
          originalUserRequest: plan.originalUserRequest,
          taskPlan: plan,
          client: runtime.session.client,
          model: target.model,
        });
        await updatePlanReviewResult({ conversationId, review });
        return review;
      } finally {
        await runtime.release();
      }
    },
  );

  registerMessageHandler(
    "myz:taskPlanStart",
    async (payload: { conversationId: string }) => {
      const settings = await readSettings();
      if (!settings.aiAssistantEnabled) {
        throw new Error("AI Assistant is not enabled");
      }
      const superpowerEnabled = Boolean(
        settings?.aiAgents?.conversation?.superpowerMode,
      );
      if (!superpowerEnabled) {
        throw new Error("Superpower Mode is not enabled");
      }

      const conversationId = payload?.conversationId;
      if (!conversationId) {
        throw new Error("conversationId is required");
      }
      const existing = await getTaskPlan(conversationId);
      if (!existing) {
        throw new Error("No task plan found for this conversation");
      }
      if (existing.planReview?.status !== "pass") {
        throw new Error("Plan review has not passed yet");
      }
      const plan = await startTaskPlanExecution(conversationId);
      if (!plan) {
        throw new Error("No task plan found for this conversation");
      }
      return plan;
    },
  );

  registerMessageHandler(
    "myz:aiStreamRequest",
    async (payload: {
      conversationId: string;
      message?: string;
      action?: string;
      attachments?: ImageAttachment[];
      clientMessageId?: string;
      context?: {
        url?: string;
        title?: string;
        includePageContext?: boolean;
      };
      options?: Partial<ProcessConversationOptions>;
    }) => {
      const settings = await readSettings();
      if (!settings.aiAssistantEnabled) {
        throw new Error("AI Assistant is not enabled");
      }

      const safePayload = payload ?? ({} as typeof payload);
      const {
        conversationId,
        message,
        action,
        context,
        options,
        attachments,
        clientMessageId,
      } = safePayload;
      if (!conversationId) {
        throw new Error("conversationId is required");
      }
      const normalizedMessage = typeof message === "string" ? message : "";
      const normalizedAttachments = Array.isArray(attachments)
        ? attachments.filter(
            (item) =>
              item?.type === "image" &&
              typeof item?.dataUrl === "string" &&
              item.dataUrl,
          )
        : [];
      if (!normalizedMessage.trim() && !normalizedAttachments.length) {
        throw new Error("message is required");
      }

      const conversation = await getConversation(conversationId);
      const conversationMode = resolveConversationMode(
        options?.conversationMode,
        conversation?.metadata?.assistantMode,
      );

      const baseTarget = resolveAgentTarget(settings, "conversation");
      let target = baseTarget;
      if (
        normalizedAttachments.length > 0 &&
        !baseTarget.model.capabilities?.vision
      ) {
        const multimodalTarget = resolveConversationMultimodalTarget(settings);
        if (!multimodalTarget) {
          throw new Error("当前模型不支持 Vision，且未配置多模态模型");
        }
        target = multimodalTarget;
      }
      const runtime = await acquireProviderRuntime(
        target.provider,
        settings.aiMcpServers || [],
      );

      try {
        const enableTools = Boolean(target.model.capabilities.toolCalling);
        if (enableTools) {
          await runtime.connectMcp();
        }
        runtime.session.mcp.setConversationContext({ conversationId });

        const aiLocalTools = settings.aiLocalTools;
        const superpowerEnabled =
          Boolean(settings.aiAgents?.conversation?.superpowerMode) &&
          conversationMode !== "chat";
        const skillPayload = superpowerEnabled
          ? { skillNames: [], skillList: [] }
          : await resolveSkillContext({
              conversationId,
              message: normalizedMessage,
              settings,
            });
        if (enableTools) {
          const enabledToolNames = Array.isArray(
            settings.aiLocalTools?.enabledToolNames,
          )
            ? settings.aiLocalTools.enabledToolNames.filter(
                (name): name is string =>
                  typeof name === "string" && name.trim().length > 0,
              )
                .map((name: string) => name.trim())
            : LOCAL_TOOL_NAMES.slice();
          const gatedToolNames = superpowerEnabled
            ? enabledToolNames
            : enabledToolNames.filter(
                (name) => !SUPERPOWER_TOOL_NAMES.includes(name),
              );
          let normalizedToolNames = superpowerEnabled
            ? gatedToolNames.filter((name: string) => name !== "SelectTools")
            : aiLocalTools?.mode === "auto"
              ? (() => {
                  if (!gatedToolNames.includes("SelectTools")) {
                    gatedToolNames.push("SelectTools");
                  }
                  return gatedToolNames;
                })()
              : gatedToolNames.filter((name: string) => name !== "SelectTools");
          runtime.session.mcp.setLocalToolAllowlist(normalizedToolNames);
        }

        const includePageContext =
          typeof context?.includePageContext === "boolean"
            ? context?.includePageContext
            : undefined;

        const agent = new ConversationAgent();
        const client = enableTools
          ? runtime.session.clientWithTools
          : runtime.session.client;

        const toolSelectorTarget = aiLocalTools?.autoSelectorTarget;
        const toolSelectorRequested =
          !superpowerEnabled && enableTools && aiLocalTools?.mode === "auto";
        const skillMetadata =
          skillPayload.skillNames.length > 0
            ? {
                skillNames: skillPayload.skillNames,
                ...(skillPayload.skillList.length
                  ? { skillList: skillPayload.skillList }
                  : {}),
              }
            : {};
        if (clientMessageId && skillPayload.skillNames.length > 0) {
          notifySidePanel("myz:aiSkillSelection", {
            conversationId,
            clientMessageId,
            skillNames: skillPayload.skillNames,
          });
        }

        return await agent.processConversation(
          conversationId,
          action || "custom",
          normalizedMessage,
          {
            ...(options || {}),
            includePageContext:
              includePageContext ?? options?.includePageContext ?? true,
            conversationMode,
            attachments: normalizedAttachments,
            stream:
              typeof options?.stream === "boolean"
                ? options.stream
                : supportsProviderStreaming(target.provider),
            metadata: {
              ...(options?.metadata || {}),
              ...(context?.url ? { url: context.url } : {}),
              ...(context?.title ? { title: context.title } : {}),
              source: "sidepanel",
              ...skillMetadata,
            },
          },
          {
            client,
            isEnabled: Boolean(settings.aiAssistantEnabled),
            callConfig: target,
            ...(enableTools
              ? {
                  toolControl: {
                    listTools: () =>
                      runtime.session.mcp.listTools().map((tool) => ({
                        name: tool?.name || "",
                        description: tool?.description || "",
                        server:
                          isRecord(tool) && typeof tool.server === "string"
                            ? tool.server
                            : "",
                      })),
                    setActiveToolFilter: (toolNames: string[] | null) =>
                      runtime.session.mcp.setActiveToolFilter(toolNames),
                  },
                }
              : {}),
            ...(toolSelectorRequested
              ? {
                  toolSelector: {
                    enabled: true,
                    selectToolNames: async (
                      prompt: string,
                      tools: Array<{
                        name: string;
                        description?: string;
                        server?: string;
                      }>,
                    ) => {
                      const normalizedPrompt =
                        typeof prompt === "string" ? prompt.trim() : "";
                      const candidates = Array.isArray(tools)
                        ? tools.filter((t) => t?.name)
                        : [];
                      if (!normalizedPrompt || candidates.length === 0) {
                        return [];
                      }

                      if (
                        !toolSelectorTarget?.providerId ||
                        !toolSelectorTarget?.modelId
                      ) {
                        return [];
                      }

                      try {
                        const resolved = resolveModelRef(
                          settings,
                          toolSelectorTarget,
                        );
                        const selectorRuntime = await acquireProviderRuntime(
                          resolved.provider,
                          [],
                        );
                        try {
                          const selector = new ToolSelectionAgent();
                          return await selector.selectToolNames({
                            prompt: normalizedPrompt,
                            tools: candidates,
                            client: selectorRuntime.session.client,
                            model: resolved.model,
                          });
                        } finally {
                          await selectorRuntime.release();
                        }
                      } catch (error) {
                        console.warn("Tool selector failed", error);
                        return [];
                      }
                    },
                  },
                }
              : {}),
          },
        );
      } finally {
        try {
          runtime.session.mcp.setActiveToolFilter(null);
        } catch {}
        try {
          runtime.session.mcp.setConversationContext(null);
        } catch {}
        if (target.model.capabilities.toolCalling) {
          await runtime.disconnectMcp();
        }
        await runtime.release();
      }
    },
  );

  registerMessageHandler(
    "myz:aiTitleRequest",
    async (payload: {
      conversationId: string;
      request?: string;
      pageTitle?: string;
      url?: string;
    }) => {
      const settings = await readSettings();
      if (!settings.aiAssistantEnabled) {
        throw new Error("AI Assistant is not enabled");
      }

      const conversationId = payload?.conversationId;
      if (!conversationId) {
        throw new Error("conversationId is required");
      }

      const conversation = await getConversation(conversationId);
      if (!conversation) {
        throw new Error("conversation not found");
      }

      const meta = conversation.metadata || {};
      const titleGenerated = meta?.titleGenerated;
      if (titleGenerated !== false) {
        return conversation;
      }

      const requestText = normalizeText(payload?.request);
      if (!requestText) {
        const failed = {
          ...conversation,
          metadata: {
            ...meta,
            titleGenerated: "failed",
          },
          updatedAt: new Date().toISOString(),
        };
        await saveConversation(failed);
        return failed;
      }

      const target = resolveAgentTarget(settings, "conversation");
      const runtime = await acquireProviderRuntime(target.provider, []);

      try {
        const agent = new ConversationTitleAgent({
          client: runtime.session.client,
        });
        const title = await agent.generateTitleWithConfig(
          {
            request: requestText,
            pageTitle: payload?.pageTitle,
            url: payload?.url,
          },
          {
            isEnabled: Boolean(settings.aiAssistantEnabled),
            callConfig: target,
          },
        );

        const nextMeta = {
          ...meta,
          pageTitle:
            typeof payload?.pageTitle === "string" && payload.pageTitle.trim()
              ? payload.pageTitle.trim()
              : meta?.pageTitle,
          titleGenerated: title ? true : "failed",
          originalUserRequest: meta?.originalUserRequest || requestText,
        };
        const updated = {
          ...conversation,
          title: title || "",
          metadata: nextMeta,
          updatedAt: new Date().toISOString(),
        };
        await saveConversation(updated);
        return updated;
      } catch (error) {
        console.warn("Conversation title generation failed", error);
        const failed = {
          ...conversation,
          metadata: {
            ...meta,
            titleGenerated: "failed",
          },
          updatedAt: new Date().toISOString(),
        };
        await saveConversation(failed);
        return failed;
      } finally {
        await runtime.release();
      }
    },
  );

  registerMessageHandler(
    "myz:compactConversation",
    async (payload: {
      conversationId: string;
      keepRecentCount?: number;
      targetTokens?: number;
    }) => {
      const settings = await readSettings();
      if (!settings.aiAssistantEnabled) {
        throw new Error("AI Assistant is not enabled");
      }

      const conversationId = payload?.conversationId;
      if (!conversationId) {
        throw new Error("conversationId is required");
      }

      const keepRecentCount =
        typeof payload?.keepRecentCount === "number" &&
        payload.keepRecentCount > 0
          ? Math.floor(payload.keepRecentCount)
          : DEFAULT_CONTEXT_COMPACTION_RECENT_COUNT;

      const messages = await getMessagesForConversation(conversationId, 2000);
      const normalizedMessages = messages.filter(
        (msg) => msg.metadata?.type !== "system_event",
      );
      if (!normalizedMessages.length) {
        return { compressed: false, messages: [] };
      }

      const systemMessages = normalizedMessages.filter(
        (msg) => msg.role === "system",
      );
      const nonSystemMessages = normalizedMessages.filter(
        (msg) => msg.role !== "system",
      );

      const userAssistantIndexes = nonSystemMessages
        .map((msg, index) =>
          msg.role === "user" || msg.role === "assistant" ? index : -1,
        )
        .filter((index) => index >= 0);

      if (userAssistantIndexes.length <= keepRecentCount) {
        return { compressed: false, messages: normalizedMessages };
      }

      const boundaryIndex =
        userAssistantIndexes[userAssistantIndexes.length - keepRecentCount];
      const oldMessages = nonSystemMessages.slice(0, boundaryIndex);
      const recentMessages = nonSystemMessages.slice(boundaryIndex);

      if (!oldMessages.length) {
        return { compressed: false, messages: normalizedMessages };
      }

      const conversation = await getConversation(conversationId);
      let originalRequest = normalizeText(
        conversation?.metadata?.originalUserRequest,
      );
      if (!originalRequest) {
        const firstUser = normalizedMessages.find((msg) => msg.role === "user");
        originalRequest = firstUser ? buildUserContextText(firstUser) : "";
      }

      const target = resolveAgentTarget(settings, "conversation");
      const runtime = await acquireProviderRuntime(target.provider, []);

      try {
        const summary = await generateContextSummary({
          messages: oldMessages,
          client: runtime.session.client,
          model: target.model,
          targetTokens: payload?.targetTokens,
        });

        if (!summary) {
          throw new Error("上下文压缩失败：无法生成摘要");
        }

        const firstRecentTimestamp = recentMessages.length
          ? Date.parse(recentMessages[0].timestamp)
          : Date.now();
        const summaryTimestamp = new Date(
          Math.max(0, firstRecentTimestamp - 1),
        ).toISOString();
        const summaryContent = [
          originalRequest ? `原始请求:\n${originalRequest}` : "",
          summary ? `上下文总结:\n${summary}` : "",
        ]
          .filter(Boolean)
          .join("\n\n");

        const summaryMessage: Message = {
          id: generateId(),
          conversationId,
          role: "user",
          content: summaryContent,
          timestamp: summaryTimestamp,
          metadata: {
            type: "compression_summary",
            ...(originalRequest ? { originalRequest } : {}),
            summary,
          },
        };

        const eventMessage: Message = {
          id: generateId(),
          conversationId,
          role: "system",
          content: "上下文已压缩",
          timestamp: new Date().toISOString(),
          metadata: { type: "system_event", event: "context_compaction" },
        };

        const compressedMessages = [
          ...systemMessages,
          summaryMessage,
          ...recentMessages,
          eventMessage,
        ];

        await replaceConversationMessages(conversationId, compressedMessages);
        await updateConversationMetadata(conversationId, {
          lastCompactionAt: new Date().toISOString(),
          skillContextInjected: [],
          ...(originalRequest ? { originalUserRequest: originalRequest } : {}),
        });

        return {
          compressed: true,
          originalCount: normalizedMessages.length,
          compressedCount: compressedMessages.length,
          messages: compressedMessages,
          summary,
        };
      } finally {
        await runtime.release();
      }
    },
  );

  registerMessageHandler(
    "myz:openSidePanelDraft",
    async (
      payload: {
        action: "interpret_selection";
        prompt?: string;
        selectionText?: string;
        selectionAttachment?: ImageAttachment | null;
        draftId?: string;
      },
      sender: chrome.runtime.MessageSender,
    ) => {
      const tabId = sender?.tab?.id;
      const windowId = sender?.tab?.windowId;
      try {
        if (typeof tabId === "number") {
          await chrome.sidePanel.open({ tabId });
        } else if (typeof windowId === "number") {
          await chrome.sidePanel.open({ windowId });
        }
      } catch (error) {
        console.warn("Failed to open sidepanel", error);
      }

      const draftPayload = {
        action: payload?.action,
        prompt: payload?.prompt,
        selectionText: payload?.selectionText,
        selectionAttachment: payload?.selectionAttachment || null,
        tabId,
        draftId: payload?.draftId || generateDraftId(),
      };

      await writePendingSidePanelAction(draftPayload);

      try {
        await chrome.runtime.sendMessage({
          type: "myz:openSidePanelWithAction",
          payload: draftPayload,
        });
      } catch (error) {
        console.warn("Forward sidepanel draft failed", error);
      }

      return { ok: true };
    },
  );

  registerMessageHandler("myz:popSidePanelAction", async () => {
    return popPendingSidePanelAction();
  });

  registerMessageHandler(
    "myz:ackSidePanelAction",
    async (payload: { draftId?: string }) => {
      const draftId =
        typeof payload?.draftId === "string" ? payload.draftId.trim() : "";
      await clearPendingSidePanelActionIfMatch(draftId);
      return { ok: true };
    },
  );

  registerMessageHandler(
    "myz:createConversation",
    async (payload: { url: string; title: string }) => {
      const settings = await readSettings();
      if (!settings.aiAssistantEnabled) {
        throw new Error("AI Assistant is not enabled");
      }

      const { url, title } = payload || {};
      const conversation = createConversation(url, title);

      // Store conversation
      const state = await readAiConversations();
      state.conversations[conversation.id] = conversation;
      state.activeConversationId = conversation.id;
      await writeAiConversations(state);

      return conversation;
    },
  );

  registerMessageHandler(
    "myz:processWithAi",
    async (payload: {
      conversationId: string;
      action: string;
      content: string;
      options?: Partial<ProcessConversationOptions>;
    }) => {
      const settings = await readSettings();
      if (!settings.aiAssistantEnabled) {
        throw new Error("AI Assistant is not enabled");
      }

      const target = resolveAgentTarget(settings, "conversation");
      const runtime = await acquireProviderRuntime(
        target.provider,
        settings.aiMcpServers || [],
      );

      try {
        const enableTools = Boolean(target.model.capabilities.toolCalling);
        if (enableTools) {
          await runtime.connectMcp();
        }
        runtime.session.mcp.setConversationContext({
          conversationId: payload?.conversationId,
        });
        const { conversationId, action, content, options = {} } = payload || {};

        const aiLocalTools = settings.aiLocalTools;
        const conversation = await getConversation(conversationId);
        const conversationMode = resolveConversationMode(
          options?.conversationMode,
          conversation?.metadata?.assistantMode,
        );
        const superpowerEnabled =
          Boolean(settings.aiAgents?.conversation?.superpowerMode) &&
          conversationMode !== "chat";
        const skillPayload = await resolveSkillContext({
          conversationId,
          message: content,
          settings,
          forceAllSkills: superpowerEnabled,
        });
        if (enableTools) {
          const enabledToolNames = Array.isArray(
            settings.aiLocalTools?.enabledToolNames,
          )
            ? settings.aiLocalTools.enabledToolNames.filter(
                (name): name is string =>
                  typeof name === "string" && name.trim().length > 0,
              )
                .map((name: string) => name.trim())
            : LOCAL_TOOL_NAMES.slice();
          const gatedToolNames = superpowerEnabled
            ? enabledToolNames
            : enabledToolNames.filter(
                (name) => !SUPERPOWER_TOOL_NAMES.includes(name),
              );
          let normalizedToolNames = superpowerEnabled
            ? gatedToolNames.filter((name: string) => name !== "SelectTools")
            : aiLocalTools?.mode === "auto"
              ? (() => {
                  if (!gatedToolNames.includes("SelectTools")) {
                    gatedToolNames.push("SelectTools");
                  }
                  return gatedToolNames;
                })()
              : gatedToolNames.filter((name: string) => name !== "SelectTools");
          runtime.session.mcp.setLocalToolAllowlist(normalizedToolNames);
        }

        const agent = new ConversationAgent();
        const client = enableTools
          ? runtime.session.clientWithTools
          : runtime.session.client;
        const toolSelectorTarget = aiLocalTools?.autoSelectorTarget;
        const toolSelectorRequested =
          !superpowerEnabled && enableTools && aiLocalTools?.mode === "auto";
        const skillMetadata =
          skillPayload.skillNames.length > 0
            ? {
                skillNames: skillPayload.skillNames,
                ...(skillPayload.skillList.length
                  ? { skillList: skillPayload.skillList }
                  : {}),
              }
            : {};
        const result = await agent.processConversation(
          conversationId,
          action,
          content,
          {
            ...(options || {}),
            metadata: {
              ...(options?.metadata || {}),
              ...skillMetadata,
            },
            stream:
              typeof options?.stream === "boolean"
                ? options.stream
                : supportsProviderStreaming(target.provider),
            conversationMode,
          },
          {
            client,
            isEnabled: Boolean(settings.aiAssistantEnabled),
            callConfig: target,
            ...(enableTools
              ? {
                  toolControl: {
                    listTools: () =>
                      runtime.session.mcp.listTools().map((tool) => ({
                        name: tool?.name || "",
                        description: tool?.description || "",
                        server:
                          isRecord(tool) && typeof tool.server === "string"
                            ? tool.server
                            : "",
                      })),
                    setActiveToolFilter: (toolNames: string[] | null) =>
                      runtime.session.mcp.setActiveToolFilter(toolNames),
                  },
                }
              : {}),
            ...(toolSelectorRequested
              ? {
                  toolSelector: {
                    enabled: true,
                    selectToolNames: async (
                      prompt: string,
                      tools: Array<{
                        name: string;
                        description?: string;
                        server?: string;
                      }>,
                    ) => {
                      const normalizedPrompt =
                        typeof prompt === "string" ? prompt.trim() : "";
                      const candidates = Array.isArray(tools)
                        ? tools.filter((t) => t?.name)
                        : [];
                      if (!normalizedPrompt || candidates.length === 0) {
                        return [];
                      }

                      if (
                        !toolSelectorTarget?.providerId ||
                        !toolSelectorTarget?.modelId
                      ) {
                        return [];
                      }

                      try {
                        const resolved = resolveModelRef(
                          settings,
                          toolSelectorTarget,
                        );
                        const selectorRuntime = await acquireProviderRuntime(
                          resolved.provider,
                          [],
                        );
                        try {
                          const selector = new ToolSelectionAgent();
                          return await selector.selectToolNames({
                            prompt: normalizedPrompt,
                            tools: candidates,
                            client: selectorRuntime.session.client,
                            model: resolved.model,
                          });
                        } finally {
                          await selectorRuntime.release();
                        }
                      } catch (error) {
                        console.warn("Tool selector failed", error);
                        return [];
                      }
                    },
                  },
                }
              : {}),
          },
        );

        if (enableTools) {
          runtime.session.mcp.setActiveToolFilter(null);
          result.availableTools = runtime.session.mcp.listTools();
        }

        return result;
      } finally {
        try {
          runtime.session.mcp.setActiveToolFilter(null);
        } catch {}
        try {
          runtime.session.mcp.setConversationContext(null);
        } catch {}
        if (target.model.capabilities.toolCalling) {
          await runtime.disconnectMcp();
        }
        await runtime.release();
      }
    },
  );

  registerMessageHandler(
    "myz:generatePageInsights",
    async (payload: Partial<PageInsightPayload>) => {
      const settings = await readSettings();
      if (!settings.aiAssistantEnabled) {
        throw new Error("AI Assistant is not enabled");
      }

      const target = resolveAgentTarget(settings, "insights");
      const runtime = await acquireProviderRuntime(
        target.provider,
        settings.aiMcpServers || [],
      );
      try {
        const agent = new InsightsAgent({
          client: runtime.session.client,
        });
        return await agent.generatePageInsightsWithConfig(payload || {}, {
          isEnabled: Boolean(settings.aiAssistantEnabled),
          callConfig: target,
        });
      } finally {
        await runtime.release();
      }
    },
  );

  registerMessageHandler(
    "myz:generateAutoHighlights",
    async (payload: {
      text?: string;
      title?: string;
      url?: string;
      maxHighlights?: number;
      temperature?: number;
    }) => {
      const settings = await readSettings();
      if (!settings.aiAssistantEnabled) {
        throw new Error("AI Assistant is not enabled");
      }

      const target = resolveAgentTarget(settings, "autoHighlight");
      const agentConfig = settings.aiAgents?.autoHighlight || {};
      const mergedPayload = {
        ...payload,
        maxHighlights:
          typeof payload?.maxHighlights === "number"
            ? payload.maxHighlights
            : agentConfig.maxHighlights,
      };
      const runtime = await acquireProviderRuntime(
        target.provider,
        settings.aiMcpServers || [],
      );
      try {
        const agent = new AutoHighlightAgent({
          client: runtime.session.client,
        });
        const result = await agent.generateAutoHighlightsWithConfig(
          mergedPayload || {},
          {
            isEnabled: Boolean(settings.aiAssistantEnabled),
            callConfig: target,
          },
        );
        return {
          ...result,
          categoryStyles: agentConfig.categoryStyles || {},
        };
      } finally {
        await runtime.release();
      }
    },
  );

  registerMessageHandler(
    "myz:getConversationHistory",
    async (payload: { conversationId: string; limit?: number }) => {
      const { conversationId, limit } = payload || {};
      return await getConversationHistory(conversationId, limit || 50);
    },
  );

  registerMessageHandler(
    "myz:listConversations",
    async (payload: { limit?: number }) => {
      const { limit } = payload || {};
      return await listConversations(limit || 100);
    },
  );

  registerMessageHandler(
    "myz:exportConversation",
    async (payload: {
      conversationId: string;
      format?: "markdown" | "json";
    }) => {
      const { conversationId, format } = payload || {};
      return await exportConversation(conversationId, format || "markdown");
    },
  );

  registerMessageHandler(
    "myz:deleteConversation",
    async (payload: { conversationId: string }) => {
      const { conversationId } = payload || {};
      await recordConversationDeletion(conversationId);
      await deleteConversation(conversationId);
      return { success: true };
    },
  );

  registerMessageHandler(
    "myz:saveAiGeneratedHighlight",
    async (payload: Partial<MyZRecord>) => {
      // Ensure we have valid timestamps
      const now = new Date().toISOString();
      const highlightData = {
        ...payload,
        createdAt: payload.createdAt || now,
        updatedAt: payload.updatedAt || now,
      };

      const highlight = await saveAiGeneratedHighlight(highlightData);

      // Save to main highlights storage
      const id = highlight.id || generateId();
      const record: MyZRecord = {
        ...highlight,
        id,
        kind: RECORD_KINDS.AI_GENERATED,
        createdAt: highlight.createdAt || now,
        updatedAt: now,
      };

      await saveHighlight(record);

      return record;
    },
  );

  registerMessageHandler(
    "myz:testMcpConnection",
    async (payload: { serverConfig: McpServerSetting }) => {
      const { serverConfig } = payload || {};
      return await testMcpConnection(serverConfig);
    },
  );

  registerMessageHandler("myz:listMcpTools", async () => {
    const settings = await readSettings();
    if (!settings.aiAssistantEnabled) {
      return { tools: [] };
    }

    const mcp = new McpCapability({
      getServers: () => settings.aiMcpServers || [],
    });
    try {
      await mcp.connect();
      return { tools: mcp.listTools() };
    } finally {
      await mcp.disconnect();
    }
  });
}
