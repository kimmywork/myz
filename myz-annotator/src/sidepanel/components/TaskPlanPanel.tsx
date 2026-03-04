import { defineComponent, computed, ref } from "vue";
import { useTaskPlanStore } from "../stores/taskPlan.js";
import { sendMessage } from "@/shared/messaging.js";
import type {
  TaskArtifact,
  TaskDeliverable,
  TaskItem,
  TaskPlan,
} from "@/background/ai/tasks/taskManager";
import { isRecord } from "@/shared/typeUtils";

const STATUS_LABELS: Record<string, string> = {
  planning: "规划中",
  reviewing: "待开始",
  needs_revision: "需调整",
  executing: "执行中",
  done: "待验证",
  validating: "验证中",
  validated: "已通过",
  needs_rework: "需修正",
};

const TASK_STATUS_LABELS: Record<string, string> = {
  pending: "未开始",
  in_progress: "进行中",
  blocked: "被阻塞",
  done: "已完成",
};

const ARTIFACT_LABELS: Record<string, string> = {
  "page-context": "页面上下文",
  screenshot: "截图",
  "dom-html": "DOM 片段",
  url: "链接",
  note: "备注",
  json: "JSON",
};

function truncateText(value: unknown, maxLen = 36) {
  const text =
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!text) return "";
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

function describeArtifact(artifact: TaskArtifact | null | undefined) {
  if (!artifact || typeof artifact !== "object") return "附件";
  const type = typeof artifact.type === "string" ? artifact.type : "";
  const label = ARTIFACT_LABELS[type] || type || "附件";
  const payload = artifact.payload;
  let detail = "";
  if (typeof payload === "string") {
    detail = payload;
  } else if (isRecord(payload)) {
    detail =
      (typeof payload.url === "string" && payload.url) ||
      (typeof payload.href === "string" && payload.href) ||
      (typeof payload.title === "string" && payload.title) ||
      (typeof payload.text === "string" && payload.text) ||
      "";
  }
  const summary = truncateText(detail);
  return summary ? `${label} · ${summary}` : label;
}

export default defineComponent({
  name: "TaskPlanPanel",
  setup() {
    const taskPlanStore = useTaskPlanStore();
    const plan = computed<TaskPlan | null>(() => taskPlanStore.taskPlan);
    const expanded = ref(false);
    const hovering = ref(false);
    const isStarting = ref(false);
    const isReviewing = ref(false);

    const progress = computed(() => {
      const tasks = plan.value?.tasks || [];
      if (!tasks.length) return { done: 0, total: 0 };
      const done = tasks.filter((task: TaskItem) => task.status === "done").length;
      return { done, total: tasks.length };
    });

    return () => {
      const current = plan.value;
      if (!current) return null;

      const tasks = Array.isArray(current.tasks) ? current.tasks : [];
      const hasTasks = tasks.length > 0;
      const currentTaskId =
        typeof current.currentTaskId === "string" ? current.currentTaskId : "";
      const currentTask =
        tasks.find(
          (task: TaskItem) =>
            task.id && task.id === currentTaskId && task.status !== "blocked",
        ) ||
        tasks.find((task: TaskItem) => task.status === "in_progress") ||
        tasks.find((task: TaskItem) => task.status === "pending") ||
        tasks[0] ||
        null;
      const showDetails = expanded.value || hovering.value;
      const visibleTasks = showDetails
        ? expanded.value
          ? tasks
          : currentTask
            ? [currentTask]
            : []
        : [];
      const showToggle = tasks.length > 1;

      const statusLabel = STATUS_LABELS[current.status] || current.status;
      const planReview = current.planReview || {};
      const reviewIssues = Array.isArray(planReview.issues)
        ? planReview.issues
        : [];
      const reviewMissing = Array.isArray(planReview.missingInfo)
        ? planReview.missingInfo
        : [];
      const validation = current.validation || {};
      const issues = Array.isArray(validation.issues) ? validation.issues : [];
      const missing = Array.isArray(validation.missingDeliverables)
        ? validation.missingDeliverables
        : [];
      const reviewPassed = planReview?.status === "pass";
      const canReview =
        (current.status === "reviewing" ||
          current.status === "needs_revision") &&
        planReview?.status !== "pass";
      const canStart =
        reviewPassed &&
        (current.status === "reviewing" || current.status === "needs_revision");
      const canResume = reviewPassed && current.status === "needs_rework";
      const reviewLabel =
        planReview?.status === "pending" ? "发起审核" : "重新审核";

      return (
        <section
          class="mt-3 rounded-2xl border border-slate-200 bg-white/80 p-3 text-sm text-slate-700 shadow-sm transition dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200"
          onMouseenter={() => {
            hovering.value = true;
          }}
          onMouseleave={() => {
            if (!expanded.value) {
              hovering.value = false;
            }
          }}
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 font-semibold">
              <span>
                任务进度（{progress.value.done}/{progress.value.total}）
              </span>
              <span class="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                {statusLabel}
              </span>
            </div>
            {showToggle && showDetails && (
              <button
                class="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                onClick={() => {
                  expanded.value = !expanded.value;
                }}
              >
                {expanded.value ? "收起列表" : "展开列表"}
              </button>
            )}
          </div>

          {showDetails && (canReview || canStart || canResume) && (
            <div class="mt-3 flex items-center gap-2">
              {canReview && (
                <button
                  class="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  disabled={isReviewing.value}
                  onClick={async () => {
                    if (!taskPlanStore.conversationId) return;
                    isReviewing.value = true;
                    try {
                      await sendMessage("myz:aiPlanReviewRequest", {
                        conversationId: taskPlanStore.conversationId,
                      });
                      await taskPlanStore.loadPlan(
                        taskPlanStore.conversationId,
                      );
                    } finally {
                      isReviewing.value = false;
                    }
                  }}
                >
                  {reviewLabel}
                </button>
              )}
              {(canStart || canResume) && (
                <button
                  class="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  disabled={isStarting.value}
                  onClick={async () => {
                    if (!taskPlanStore.conversationId) return;
                    isStarting.value = true;
                    try {
                      const updated = await sendMessage<
                        { conversationId: string },
                        TaskPlan
                      >("myz:taskPlanStart", {
                        conversationId: taskPlanStore.conversationId,
                      });
                      taskPlanStore.setPlan(updated || null);
                    } finally {
                      isStarting.value = false;
                    }
                  }}
                >
                  {canResume ? "继续执行" : "开始执行"}
                </button>
              )}
            </div>
          )}

          {showDetails && hasTasks && (
            <div class="mt-3 space-y-2">
              {!expanded.value && currentTask && (
                <div class="text-[11px] text-slate-400 dark:text-slate-500">
                  当前任务
                </div>
              )}
              {visibleTasks.map((task: TaskItem, index: number) => {
                const displayIndex =
                  tasks.findIndex(
                    (item: TaskItem) => item === task || item.id === task.id,
                  ) + 1 || index + 1;
                return (
                  <div
                    class="rounded-xl border border-slate-200 bg-slate-50/60 p-2 text-xs dark:border-white/10 dark:bg-slate-900/40"
                    key={task.id || index}
                  >
                    <div class="flex items-center justify-between">
                      <div class="font-medium">
                        {displayIndex}. {task.title}
                      </div>
                      <span class="text-[11px] text-slate-500 dark:text-slate-400">
                        {TASK_STATUS_LABELS[task.status] || task.status}
                      </span>
                    </div>
                    <div class="mt-1 flex flex-wrap gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                      {task.owner && (
                        <span class="rounded-full border border-slate-200 px-2 py-0.5 dark:border-slate-700">
                          {task.owner}
                        </span>
                      )}
                      {task.category && (
                        <span class="rounded-full border border-slate-200 px-2 py-0.5 dark:border-slate-700">
                          {task.category}
                        </span>
                      )}
                      {Array.isArray(task.skills) &&
                        task.skills.map((skill: string) => (
                          <span
                            class="rounded-full border border-slate-200 px-2 py-0.5 dark:border-slate-700"
                            key={`${task.id || index}-skill-${skill}`}
                          >
                            {skill}
                          </span>
                        ))}
                    </div>
                    {Array.isArray(task.deliverables) &&
                      task.deliverables.length > 0 && (
                        <ul class="mt-2 list-disc pl-4 text-[11px] text-slate-500 dark:text-slate-400">
                          {task.deliverables.map(
                            (deliverable: TaskDeliverable, dIndex: number) => (
                              <li
                                key={deliverable.id || `${task.id}-d-${dIndex}`}
                              >
                                <span>
                                  {deliverable.description || "交付物"}
                                </span>
                                {deliverable.status === "done" ? (
                                  <span class="ml-2 text-emerald-600 dark:text-emerald-300">
                                    已完成
                                  </span>
                                ) : (
                                  <span class="ml-2 text-slate-400">
                                    未完成
                                  </span>
                                )}
                                {Array.isArray(deliverable.artifacts) &&
                                  deliverable.artifacts.length > 0 && (
                                    <ul class="mt-1 list-disc pl-4 text-[10px] text-slate-400 dark:text-slate-500">
                                      {deliverable.artifacts.map(
                                        (artifact: TaskArtifact, aIndex: number) => (
                                          <li
                                            key={`${task.id}-d-${dIndex}-a-${aIndex}`}
                                          >
                                            {describeArtifact(artifact)}
                                          </li>
                                        ),
                                      )}
                                    </ul>
                                  )}
                              </li>
                            ),
                          )}
                        </ul>
                      )}
                  </div>
                );
              })}
            </div>
          )}

          {showDetails && planReview?.status === "needs_revision" && (
            <div class="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              <div class="font-semibold">计划需调整</div>
              {reviewIssues.length === 0 && reviewMissing.length === 0 && (
                <div class="mt-1">
                  暂未给出具体问题，请补充目标、约束或验收标准，或点击“重新审核”。
                </div>
              )}
              {reviewIssues.length > 0 && (
                <div class="mt-1">
                  <div class="font-medium">问题：</div>
                  <ul class="mt-1 list-disc pl-4">
                    {reviewIssues.map((issue: string) => (
                      <li>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
              {reviewMissing.length > 0 && (
                <div class="mt-2">
                  <div class="font-medium">缺失信息：</div>
                  <ul class="mt-1 list-disc pl-4">
                    {reviewMissing.map((item: string) => (
                      <li>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {showDetails &&
            planReview?.status === "pass" &&
            current.status === "reviewing" && (
              <div class="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200">
                计划已通过审核，可开始执行
              </div>
            )}

          {showDetails && validation?.status === "fail" && (
            <div class="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
              <div class="font-semibold">验证未通过</div>
              {issues.length > 0 && (
                <div class="mt-1">
                  <div class="font-medium">问题：</div>
                  <ul class="mt-1 list-disc pl-4">
                    {issues.map((issue: string) => (
                      <li>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
              {missing.length > 0 && (
                <div class="mt-2">
                  <div class="font-medium">缺失交付物：</div>
                  <ul class="mt-1 list-disc pl-4">
                    {missing.map((item: string) => (
                      <li>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {showDetails && validation?.status === "pass" && (
            <div class="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200">
              已通过验证
            </div>
          )}
        </section>
      );
    };
  },
});
