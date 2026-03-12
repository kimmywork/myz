import {
  getConversation,
  updateConversationMetadata,
} from "@/sidepanel/aiStorage";
import { isRecord } from "@myz/shared/typeUtils";

export type TaskPlanStatus =
  | "planning"
  | "reviewing"
  | "needs_revision"
  | "executing"
  | "done"
  | "validating"
  | "validated"
  | "needs_rework";

export type TaskStatus = "pending" | "in_progress" | "done" | "blocked";
export type DeliverableStatus = "pending" | "done";
export type TaskPriority = "low" | "medium" | "high";
export type TaskOwner =
  | "planner"
  | "executor"
  | "research"
  | "automation"
  | "review";
export type TaskCategory = "quick" | "research" | "automation" | "reasoning";
export type TaskPlanMode = "quick" | "orchestrated";

const MAX_ARTIFACT_CHARS = 32000;

export interface TaskArtifact {
  type: "page-context" | "screenshot" | "dom-html" | "url" | "note" | "json";
  payload: unknown;
}

export interface TaskDeliverable {
  id: string;
  description: string;
  status: DeliverableStatus;
  artifacts: TaskArtifact[];
}

export interface TaskItem {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  owner: TaskOwner;
  blockedBy: string[];
  blocks: string[];
  category: TaskCategory;
  skills: string[];
  deliverables: TaskDeliverable[];
}

export interface TaskPlanReview {
  status: "pending" | "pass" | "needs_revision";
  issues: string[];
  missingInfo: string[];
}

export interface TaskValidationResult {
  status: "pending" | "pass" | "fail";
  expectationScore: number;
  deliverableScore: number;
  issues: string[];
  missingDeliverables: string[];
}

export interface TaskPlan {
  id: string;
  status: TaskPlanStatus;
  mode: TaskPlanMode;
  originalUserRequest: string;
  assumptions?: string[];
  tasks: TaskItem[];
  currentTaskId: string | null;
  planReview: TaskPlanReview;
  validation: TaskValidationResult;
  createdAt: string;
  updatedAt: string;
}

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeTaskStatus(value: unknown): TaskStatus {
  if (value === "done") return "done";
  if (value === "in_progress") return "in_progress";
  if (value === "blocked") return "blocked";
  return "pending";
}

function normalizeDeliverableStatus(value: unknown): DeliverableStatus {
  return value === "done" ? "done" : "pending";
}

function normalizePlanStatus(value: unknown): TaskPlanStatus {
  switch (value) {
    case "planning":
    case "reviewing":
    case "needs_revision":
    case "executing":
    case "done":
    case "validating":
    case "validated":
    case "needs_rework":
      return value;
    default:
      return "reviewing";
  }
}

function normalizePriority(value: unknown): TaskPriority {
  return value === "high" ? "high" : value === "low" ? "low" : "medium";
}

function normalizeOwner(value: unknown): TaskOwner {
  switch (value) {
    case "planner":
    case "executor":
    case "research":
    case "automation":
    case "review":
      return value;
    default:
      return "executor";
  }
}

function normalizeCategory(value: unknown): TaskCategory {
  switch (value) {
    case "research":
    case "automation":
    case "reasoning":
      return value;
    default:
      return "quick";
  }
}

function normalizeMode(value: unknown): TaskPlanMode {
  return value === "orchestrated" ? "orchestrated" : "quick";
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function truncateArtifactPayload(payload: unknown) {
  if (payload == null) return "";
  if (typeof payload === "string") {
    return payload.length > MAX_ARTIFACT_CHARS
      ? payload.slice(0, MAX_ARTIFACT_CHARS)
      : payload;
  }
  let rawText = "";
  try {
    rawText = JSON.stringify(payload);
  } catch {
    rawText = String(payload);
  }
  if (rawText.length <= MAX_ARTIFACT_CHARS) {
    return payload;
  }
  return {
    truncated: true,
    content: rawText.slice(0, MAX_ARTIFACT_CHARS),
    originalType: typeof payload,
    size: rawText.length,
  };
}

function enforceArtifactSize(artifact: unknown) {
  if (!isRecord(artifact)) return artifact;
  if (!("payload" in artifact)) return artifact;
  return {
    ...artifact,
    payload: truncateArtifactPayload(artifact.payload),
  };
}

function normalizeArtifacts(value: unknown): TaskArtifact[] {
  if (!Array.isArray(value)) return [];
  const artifacts: TaskArtifact[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const type = typeof item.type === "string" ? item.type : "";
    if (
      ![
        "page-context",
        "screenshot",
        "dom-html",
        "url",
        "note",
        "json",
      ].includes(type)
    ) {
      continue;
    }
    const payload = truncateArtifactPayload(item.payload ?? "");
    artifacts.push({
      type: type as TaskArtifact["type"],
      payload,
    });
  }
  return artifacts;
}

function rebuildTaskBlocks(plan: TaskPlan) {
  plan.tasks.forEach((task) => {
    task.blocks = [];
  });
  plan.tasks.forEach((task) => {
    task.blockedBy.forEach((blockedId) => {
      const blocker = plan.tasks.find((item) => item.id === blockedId);
      if (!blocker) return;
      if (!blocker.blocks.includes(task.id)) {
        blocker.blocks.push(task.id);
      }
    });
  });
}

function breakCyclicDependencies(plan: TaskPlan) {
  const taskMap = new Map(plan.tasks.map((task) => [task.id, task]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const dfs = (taskId: string) => {
    if (visited.has(taskId)) return;
    if (visiting.has(taskId)) return;
    const task = taskMap.get(taskId);
    if (!task) return;
    visiting.add(taskId);
    const deps = Array.isArray(task.blockedBy) ? [...task.blockedBy] : [];
    deps.forEach((dep) => {
      if (!taskMap.has(dep)) return;
      if (visiting.has(dep)) {
        task.blockedBy = task.blockedBy.filter((id) => id !== dep);
        console.warn("Task plan has cyclic dependency, dropping edge", {
          from: taskId,
          to: dep,
        });
        return;
      }
      dfs(dep);
    });
    task.blockedBy = Array.from(new Set(task.blockedBy));
    visiting.delete(taskId);
    visited.add(taskId);
  };

  plan.tasks.forEach((task) => dfs(task.id));
}

function resolveTaskDependencies(plan: TaskPlan) {
  const idSet = new Set(plan.tasks.map((task) => task.id));
  const indexMap = new Map<number, string>();
  const titleCount = new Map<string, number>();
  plan.tasks.forEach((task, index) => {
    indexMap.set(index + 1, task.id);
    const title =
      typeof task.title === "string" ? task.title.trim().toLowerCase() : "";
    if (!title) return;
    titleCount.set(title, (titleCount.get(title) || 0) + 1);
  });
  const titleMap = new Map<string, string>();
  plan.tasks.forEach((task) => {
    const title =
      typeof task.title === "string" ? task.title.trim().toLowerCase() : "";
    if (!title) return;
    if (titleCount.get(title) === 1) {
      titleMap.set(title, task.id);
    }
  });

  const resolveRef = (value: string) => {
    const raw = typeof value === "string" ? value.trim() : "";
    if (!raw) return "";
    if (idSet.has(raw)) return raw;
    const lowered = raw.toLowerCase();
    let index: number | null = null;
    if (/^#?\d+$/.test(lowered)) {
      index = Number.parseInt(lowered.replace(/^#/, ""), 10);
    } else {
      const match = /^(task|t|step|任务|步骤)[-_ ]*(\d+)$/.exec(lowered);
      if (match) {
        index = Number.parseInt(match[2], 10);
      }
    }
    if (index && indexMap.has(index)) {
      return indexMap.get(index) || "";
    }
    if (titleMap.has(lowered)) {
      return titleMap.get(lowered) || "";
    }
    return "";
  };

  plan.tasks.forEach((task) => {
    const blockedBy = Array.isArray(task.blockedBy) ? task.blockedBy : [];
    const blocks = Array.isArray(task.blocks) ? task.blocks : [];

    const resolvedBlocked = blockedBy
      .map((item) => resolveRef(item))
      .filter((id) => id && id !== task.id);
    const resolvedBlocks = blocks
      .map((item) => resolveRef(item))
      .filter((id) => id && id !== task.id);

    task.blockedBy = Array.from(new Set(resolvedBlocked));
    task.blocks = Array.from(new Set(resolvedBlocks));
  });

  rebuildTaskBlocks(plan);
  breakCyclicDependencies(plan);
  rebuildTaskBlocks(plan);
}

function computePlanStatus(plan: TaskPlan): TaskPlanStatus {
  if (plan.status === "validated") return "validated";
  if (plan.status === "needs_rework") return "needs_rework";
  if (plan.status === "reviewing") return "reviewing";
  if (plan.status === "needs_revision") return "needs_revision";
  if (plan.status === "executing") return "executing";
  if (plan.status === "validating") return "validating";
  if (plan.status === "planning" && plan.tasks.length === 0) return "planning";
  if (plan.planReview?.status === "needs_revision") return "needs_revision";
  if (plan.planReview?.status === "pending") {
    return plan.tasks.length === 0 ? "planning" : "reviewing";
  }
  if (!plan.tasks.length) {
    return "done";
  }
  const allDone = plan.tasks.every((task) => task.status === "done");
  if (allDone) {
    return "done";
  }
  return "executing";
}

function normalizeTaskDeliverables(
  deliverables: unknown,
  defaults?: { createIfEmpty?: boolean },
): TaskDeliverable[] {
  const items = Array.isArray(deliverables) ? deliverables : [];
  const normalized = items
    .map((deliverable) => {
      if (!isRecord(deliverable)) return null;
      const description =
        typeof deliverable.description === "string"
          ? deliverable.description.trim()
          : "";
      if (!description) return null;
      return {
        id:
          typeof deliverable.id === "string"
            ? deliverable.id
            : generateId("deliverable"),
        description,
        status: normalizeDeliverableStatus(deliverable.status),
        artifacts: normalizeArtifacts(deliverable.artifacts),
      };
    })
    .filter((item): item is TaskDeliverable => Boolean(item));

  if (normalized.length) return normalized;
  if (defaults?.createIfEmpty) {
    return [
      {
        id: generateId("deliverable"),
        description: "交付物",
        status: "pending",
        artifacts: [],
      },
    ];
  }
  return [];
}

function normalizeTaskItem(task: unknown): TaskItem {
  const item = isRecord(task) ? task : {};
  const title = typeof item.title === "string" ? item.title.trim() : "";
  return {
    id: typeof item.id === "string" ? item.id : generateId("task"),
    title: title || "未命名任务",
    status: normalizeTaskStatus(item.status),
    priority: normalizePriority(item.priority),
    owner: normalizeOwner(item.owner),
    blockedBy: normalizeStringArray(item.blockedBy),
    blocks: normalizeStringArray(item.blocks),
    category: normalizeCategory(item.category),
    skills: normalizeStringArray(item.skills),
    deliverables: normalizeTaskDeliverables(item.deliverables, {
      createIfEmpty: true,
    }),
  };
}

function normalizePlanReview(value: unknown): TaskPlanReview {
  const review = isRecord(value) ? value : {};
  return {
    status:
      review.status === "pass"
        ? "pass"
        : review.status === "needs_revision"
          ? "needs_revision"
          : "pending",
    issues: normalizeStringArray(review.issues),
    missingInfo: normalizeStringArray(review.missingInfo),
  };
}

function isTaskBlocked(plan: TaskPlan, task: TaskItem) {
  if (!task.blockedBy.length) return false;
  return task.blockedBy.some((id) => {
    const blocker = plan.tasks.find((item) => item.id === id);
    if (!blocker) return false;
    return blocker.status !== "done";
  });
}

function applyTaskBlocking(plan: TaskPlan) {
  plan.tasks.forEach((task) => {
    if (task.status === "done") return;
    const blocked = isTaskBlocked(plan, task);
    if (blocked && task.status !== "blocked") {
      task.status = "blocked";
    } else if (!blocked && task.status === "blocked") {
      task.status = "pending";
    }
  });
}

function pickNextTask(plan: TaskPlan): TaskItem | null {
  const inProgress = plan.tasks.find(
    (task) => task.status === "in_progress" && !isTaskBlocked(plan, task),
  );
  if (inProgress) return inProgress;

  const candidates = plan.tasks.filter(
    (task) => task.status === "pending" && !isTaskBlocked(plan, task),
  );
  if (!candidates.length) return null;
  const priorityRank: Record<TaskPriority, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };
  candidates.sort((a, b) => {
    const diff = priorityRank[a.priority] - priorityRank[b.priority];
    if (diff !== 0) return diff;
    return plan.tasks.indexOf(a) - plan.tasks.indexOf(b);
  });
  return candidates[0];
}

function ensureCurrentTask(plan: TaskPlan) {
  if (plan.status !== "executing" && plan.status !== "needs_rework") {
    return;
  }
  applyTaskBlocking(plan);
  let current =
    typeof plan.currentTaskId === "string"
      ? plan.tasks.find((task) => task.id === plan.currentTaskId)
      : null;
  if (current && (current.status === "done" || isTaskBlocked(plan, current))) {
    current = null;
  }
  if (!current) {
    current = pickNextTask(plan);
  }
  if (current) {
    plan.currentTaskId = current.id;
    if (current.status === "pending") {
      current.status = "in_progress";
    }
  } else {
    plan.currentTaskId = null;
  }
}

function notifyTaskPlanUpdated(conversationId: string, plan: TaskPlan) {
  try {
    chrome.runtime.sendMessage({
      type: "myz:taskPlanUpdated",
      data: { conversationId, plan },
    });
  } catch {
    // ignore
  }
}

export function normalizeTaskPlanPayload(value: unknown): TaskPlan | null {
  if (!isRecord(value)) return null;
  const raw = value;

  const normalized: TaskPlan = {
    id: typeof raw.id === "string" ? raw.id : generateId("plan"),
    status: normalizePlanStatus(raw.status),
    mode: normalizeMode(raw.mode),
    originalUserRequest:
      typeof raw.originalUserRequest === "string"
        ? raw.originalUserRequest
        : "",
    assumptions: normalizeStringArray(raw.assumptions),
    tasks: Array.isArray(raw.tasks) ? raw.tasks.map(normalizeTaskItem) : [],
    currentTaskId:
      typeof raw.currentTaskId === "string" ? raw.currentTaskId : null,
    planReview: normalizePlanReview(raw.planReview),
    validation: {
      status:
        isRecord(raw.validation) && raw.validation.status === "pass"
          ? "pass"
          : isRecord(raw.validation) && raw.validation.status === "fail"
            ? "fail"
            : "pending",
      expectationScore:
        isRecord(raw.validation) &&
        typeof raw.validation.expectationScore === "number"
          ? raw.validation.expectationScore
          : 0,
      deliverableScore:
        isRecord(raw.validation) &&
        typeof raw.validation.deliverableScore === "number"
          ? raw.validation.deliverableScore
          : 0,
      issues: normalizeStringArray(
        isRecord(raw.validation) ? raw.validation.issues : undefined,
      ),
      missingDeliverables: normalizeStringArray(
        isRecord(raw.validation) ? raw.validation.missingDeliverables : undefined,
      ),
    },
    createdAt:
      typeof raw.createdAt === "string"
        ? raw.createdAt
        : new Date().toISOString(),
    updatedAt:
      typeof raw.updatedAt === "string"
        ? raw.updatedAt
        : new Date().toISOString(),
  };
  resolveTaskDependencies(normalized);
  applyTaskBlocking(normalized);
  normalized.status = computePlanStatus(normalized);
  return normalized;
}

export async function getTaskPlan(
  conversationId: string,
): Promise<TaskPlan | null> {
  const conversation = await getConversation(conversationId);
  const raw = conversation?.metadata?.taskPlan;
  if (!raw) return null;
  return normalizeTaskPlanPayload(raw);
}

export async function initTaskPlan(options: {
  conversationId: string;
  originalUserRequest: string;
  tasks: Array<unknown>;
  status?: TaskPlanStatus;
  mode?: TaskPlanMode;
  assumptions?: string[];
}) {
  const now = new Date().toISOString();
  const tasks: TaskItem[] = (options.tasks || []).map(normalizeTaskItem);

  const plan: TaskPlan = {
    id: generateId("plan"),
    status: options.status || "reviewing",
    mode: normalizeMode(
      options.mode ||
        (tasks.length > 3 || tasks.some((task) => task.blockedBy.length > 0)
          ? "orchestrated"
          : "quick"),
    ),
    originalUserRequest: options.originalUserRequest,
    assumptions: Array.isArray(options.assumptions) ? options.assumptions : [],
    tasks,
    currentTaskId: null,
    planReview: {
      status: "pending",
      issues: [],
      missingInfo: [],
    },
    validation: {
      status: "pending",
      expectationScore: 0,
      deliverableScore: 0,
      issues: [],
      missingDeliverables: [],
    },
    createdAt: now,
    updatedAt: now,
  };
  resolveTaskDependencies(plan);
  applyTaskBlocking(plan);
  plan.status = computePlanStatus(plan);
  const updated = await updateConversationMetadata(options.conversationId, {
    taskPlan: plan,
  });
  if (updated) {
    notifyTaskPlanUpdated(options.conversationId, plan);
  }
  return plan;
}

export async function updateTaskPlanStatus(options: {
  conversationId: string;
  status?: TaskPlanStatus;
  currentTaskId?: string | null;
  mode?: TaskPlanMode;
}) {
  const plan = await getTaskPlan(options.conversationId);
  if (!plan) return null;
  if (options.status) {
    plan.status = options.status;
  }
  if (options.mode) {
    plan.mode = normalizeMode(options.mode);
  }
  if (typeof options.currentTaskId !== "undefined") {
    plan.currentTaskId = options.currentTaskId;
  }
  if (plan.status === "executing" || plan.status === "needs_rework") {
    ensureCurrentTask(plan);
  }
  plan.status = computePlanStatus(plan);
  plan.updatedAt = new Date().toISOString();
  const updated = await updateConversationMetadata(options.conversationId, {
    taskPlan: plan,
  });
  if (updated) {
    notifyTaskPlanUpdated(options.conversationId, plan);
  }
  return plan;
}

export async function updateTaskStatus(options: {
  conversationId: string;
  taskId: string;
  status?: TaskStatus;
}) {
  const plan = await getTaskPlan(options.conversationId);
  if (!plan) return null;
  const task = plan.tasks.find((item) => item.id === options.taskId);
  if (!task) return null;
  if (typeof options.status !== "undefined") {
    task.status = normalizeTaskStatus(options.status);
  }
  if (task.status === "done") {
    const allDeliverablesDone = task.deliverables.every(
      (deliverable) => deliverable.status === "done",
    );
    if (!allDeliverablesDone) {
      task.deliverables.forEach((deliverable) => {
        deliverable.status = "done";
      });
    }
  }
  if (plan.status === "executing" || plan.status === "needs_rework") {
    ensureCurrentTask(plan);
  }
  plan.status = computePlanStatus(plan);
  plan.updatedAt = new Date().toISOString();
  const updated = await updateConversationMetadata(options.conversationId, {
    taskPlan: plan,
  });
  if (updated) {
    notifyTaskPlanUpdated(options.conversationId, plan);
  }
  return plan;
}

export async function updateTaskItem(options: {
  conversationId: string;
  taskId: string;
  patch: Partial<TaskItem>;
}) {
  const plan = await getTaskPlan(options.conversationId);
  if (!plan) return null;
  const task = plan.tasks.find((item) => item.id === options.taskId);
  if (!task) return null;

  if (typeof options.patch.title === "string") {
    task.title = options.patch.title.trim();
  }
  if (typeof options.patch.status !== "undefined") {
    task.status = normalizeTaskStatus(options.patch.status);
  }
  if (typeof options.patch.priority !== "undefined") {
    task.priority = normalizePriority(options.patch.priority);
  }
  if (typeof options.patch.owner !== "undefined") {
    task.owner = normalizeOwner(options.patch.owner);
  }
  if (typeof options.patch.category !== "undefined") {
    task.category = normalizeCategory(options.patch.category);
  }
  if (typeof options.patch.skills !== "undefined") {
    task.skills = normalizeStringArray(options.patch.skills);
  }
  if (typeof options.patch.blockedBy !== "undefined") {
    task.blockedBy = normalizeStringArray(options.patch.blockedBy);
  }
  if (typeof options.patch.blocks !== "undefined") {
    task.blocks = normalizeStringArray(options.patch.blocks);
  }

  resolveTaskDependencies(plan);

  if (task.status === "done") {
    const allDeliverablesDone = task.deliverables.every(
      (deliverable) => deliverable.status === "done",
    );
    if (!allDeliverablesDone) {
      task.deliverables.forEach((deliverable) => {
        deliverable.status = "done";
      });
    }
  }

  if (plan.status === "executing" || plan.status === "needs_rework") {
    ensureCurrentTask(plan);
  }
  plan.status = computePlanStatus(plan);
  plan.updatedAt = new Date().toISOString();
  const updated = await updateConversationMetadata(options.conversationId, {
    taskPlan: plan,
  });
  if (updated) {
    notifyTaskPlanUpdated(options.conversationId, plan);
  }
  return plan;
}

export async function attachDeliverableArtifact(options: {
  conversationId: string;
  taskId: string;
  deliverableId?: string;
  deliverableIndex?: number;
  description?: string;
  artifact?: unknown;
  artifacts?: unknown[];
  status?: DeliverableStatus;
}) {
  const plan = await getTaskPlan(options.conversationId);
  if (!plan) return null;
  const task = plan.tasks.find((item) => item.id === options.taskId);
  if (!task) return null;

  let deliverable: TaskDeliverable | null = null;
  if (options.deliverableId) {
    deliverable =
      task.deliverables.find((item) => item.id === options.deliverableId) ||
      null;
  } else if (typeof options.deliverableIndex === "number") {
    deliverable = task.deliverables[options.deliverableIndex] || null;
  } else if (options.description) {
    deliverable =
      task.deliverables.find(
        (item) => item.description === options.description,
      ) || null;
  }

  if (!deliverable && options.description) {
    deliverable = {
      id: generateId("deliverable"),
      description: options.description,
      status: "pending",
      artifacts: [],
    };
    task.deliverables.push(deliverable);
  }

  if (!deliverable) return null;

  const incoming = Array.isArray(options.artifacts)
    ? options.artifacts
    : typeof options.artifact !== "undefined"
      ? [options.artifact]
      : [];
  if (incoming.length > 0) {
    incoming.forEach((item) => {
      deliverable?.artifacts.push(enforceArtifactSize(item) as TaskArtifact);
    });
  }
  deliverable.status = normalizeDeliverableStatus(options.status || "done");

  const allDeliverablesDone = task.deliverables.every(
    (item) => item.status === "done",
  );
  if (allDeliverablesDone && task.status !== "done") {
    task.status = "done";
  }

  if (plan.status === "executing" || plan.status === "needs_rework") {
    ensureCurrentTask(plan);
  }

  plan.status = computePlanStatus(plan);
  plan.updatedAt = new Date().toISOString();
  const updated = await updateConversationMetadata(options.conversationId, {
    taskPlan: plan,
  });
  if (updated) {
    notifyTaskPlanUpdated(options.conversationId, plan);
  }
  return plan;
}

export async function updateValidationResult(options: {
  conversationId: string;
  validation: TaskValidationResult;
}) {
  const plan = await getTaskPlan(options.conversationId);
  if (!plan) return null;
  plan.validation = {
    ...options.validation,
  };
  plan.status =
    options.validation.status === "pass"
      ? "validated"
      : options.validation.status === "fail"
        ? "needs_rework"
        : plan.status;
  if (plan.status === "needs_rework") {
    ensureCurrentTask(plan);
  }
  plan.updatedAt = new Date().toISOString();
  const updated = await updateConversationMetadata(options.conversationId, {
    taskPlan: plan,
  });
  if (updated) {
    notifyTaskPlanUpdated(options.conversationId, plan);
  }
  return plan;
}

export async function completeAllTasks(conversationId: string) {
  const plan = await getTaskPlan(conversationId);
  if (!plan) return null;
  plan.tasks.forEach((task) => {
    task.status = "done";
    task.deliverables.forEach((deliverable) => {
      deliverable.status = "done";
    });
  });
  plan.currentTaskId = null;
  plan.status = "done";
  plan.status = computePlanStatus(plan);
  plan.updatedAt = new Date().toISOString();
  const updated = await updateConversationMetadata(conversationId, {
    taskPlan: plan,
  });
  if (updated) {
    notifyTaskPlanUpdated(conversationId, plan);
  }
  return plan;
}

export async function updatePlanReviewResult(options: {
  conversationId: string;
  review: TaskPlanReview;
}) {
  const plan = await getTaskPlan(options.conversationId);
  if (!plan) return null;
  plan.planReview = normalizePlanReview(options.review);
  if (plan.planReview.status === "needs_revision") {
    plan.status = "needs_revision";
  } else if (
    plan.planReview.status === "pass" &&
    plan.status === "needs_revision"
  ) {
    plan.status = "reviewing";
  }
  plan.updatedAt = new Date().toISOString();
  const updated = await updateConversationMetadata(options.conversationId, {
    taskPlan: plan,
  });
  if (updated) {
    notifyTaskPlanUpdated(options.conversationId, plan);
  }
  return plan;
}

export async function startTaskPlanExecution(conversationId: string) {
  const plan = await getTaskPlan(conversationId);
  if (!plan) return null;
  plan.status = "executing";
  ensureCurrentTask(plan);
  plan.status = computePlanStatus(plan);
  plan.updatedAt = new Date().toISOString();
  const updated = await updateConversationMetadata(conversationId, {
    taskPlan: plan,
  });
  if (updated) {
    notifyTaskPlanUpdated(conversationId, plan);
  }
  return plan;
}

export async function listUnblockedTasks(options: {
  conversationId: string;
  status?: TaskStatus[];
}) {
  const plan = await getTaskPlan(options.conversationId);
  if (!plan) return [];
  applyTaskBlocking(plan);
  const statuses = Array.isArray(options.status) ? options.status : [];
  return plan.tasks.filter((task) => {
    if (isTaskBlocked(plan, task)) return false;
    if (!statuses.length) return task.status !== "done";
    return statuses.includes(task.status);
  });
}
