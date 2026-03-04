import type { AIModelSetting, MaxOutputTokenParam } from "../../settings.js";
import { injectSystemPromptAsUserMessage } from "../prompt/systemPrompt.js";
import type {
  ChatCompletionClient,
  ProviderChatCompletionRequest,
  ProviderMessage,
} from "../providers/types.js";
import type { TaskPlan, TaskPlanReview } from "../tasks/taskManager.js";

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

function normalizeMaxOutput(model: AIModelSetting, fallback = 256, cap = 384) {
  const max =
    typeof model?.limits?.maxOutputTokens === "number"
      ? model.limits.maxOutputTokens
      : fallback;
  return Math.max(96, Math.min(cap, Math.floor(max || fallback)));
}

function buildSystemPrompt() {
  return [
    "你是 Plan Review。",
    "目标：检查计划是否可验证、依赖清晰、缺信息已转为前置任务、范围匹配需求。",
    "若判定 needs_revision，必须给出至少 1 条 issues 或 missingInfo。",
    "只输出 JSON。",
    '输出：{ "status": "pass|needs_revision", "issues": [], "missingInfo": [] }',
  ].join("\n");
}

function buildUserPrompt(options: {
  originalUserRequest: string;
  taskPlan: TaskPlan;
}) {
  const payload = JSON.stringify(
    {
      originalUserRequest: options.originalUserRequest,
      taskPlan: options.taskPlan,
    },
    null,
    2,
  );
  return ["请审查以下计划：", payload, "", "请输出 JSON。"].join("\n");
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function buildFallbackReview(options: {
  originalUserRequest: string;
  taskPlan: TaskPlan;
}): TaskPlanReview {
  const issues: string[] = [];
  if (!options.originalUserRequest.trim()) {
    issues.push("缺少原始需求或目标描述");
  }
  if (
    !Array.isArray(options.taskPlan.tasks) ||
    options.taskPlan.tasks.length === 0
  ) {
    issues.push("任务列表为空，无法执行");
  }
  if (issues.length === 0) {
    issues.push("请补充目标、约束或验收标准，或说明可用账号/权限");
  }
  return {
    status: "needs_revision",
    issues,
    missingInfo: [],
  };
}

export class PlanReviewAgent {
  async review(options: {
    originalUserRequest: string;
    taskPlan: TaskPlan;
    client: ChatCompletionClient;
    model: AIModelSetting;
  }): Promise<TaskPlanReview> {
    const maxOutputTokens = normalizeMaxOutput(options.model, 256, 384);
    const maxOutputTokenParam: MaxOutputTokenParam =
      options.model?.limits?.maxOutputTokenParam === "max_completion_tokens"
        ? "max_completion_tokens"
        : "max_tokens";

    const baseMessages: ProviderMessage[] = [
      { role: "system", content: buildSystemPrompt() },
      {
        role: "user",
        content: buildUserPrompt({
          originalUserRequest: options.originalUserRequest,
          taskPlan: options.taskPlan,
        }),
      },
    ];
    const messages = injectSystemPromptAsUserMessage(
      baseMessages,
      Boolean(options.model?.systemPromptInUserMessage),
    );
    const request: ProviderChatCompletionRequest = {
      model: options.model.model,
      messages,
      temperature: 0.1,
      stream: false,
    };
    if (maxOutputTokenParam === "max_completion_tokens") {
      request.max_completion_tokens = maxOutputTokens;
    } else {
      request.max_tokens = maxOutputTokens;
    }

    const response = await options.client.createCompletion(request, {
      enableGeminiThinking: Boolean(options.model?.capabilities?.reasoning),
    });
    const text = String(response?.choices?.[0]?.message?.content || "").trim();
    const parsed = extractFirstJsonObject(text) || {};

    const status = parsed.status === "pass" ? "pass" : "needs_revision";
    const issues = normalizeStringArray(parsed.issues);
    const missingInfo = normalizeStringArray(parsed.missingInfo);
    if (
      status === "needs_revision" &&
      issues.length === 0 &&
      missingInfo.length === 0
    ) {
      return buildFallbackReview({
        originalUserRequest: options.originalUserRequest,
        taskPlan: options.taskPlan,
      });
    }
    return {
      status,
      issues,
      missingInfo,
    };
  }
}
