import { defineComponent, computed, ref } from "vue"
import { useTaskPlanStore } from "../stores/taskPlan.js"
import type { TaskItem, TaskPlan } from "@/background/ai/tasks/taskManager"

const STATUS_LABELS: Record<string, string> = {
  planning: "规划中",
  executing: "执行中",
  blocked: "等待输入",
  done: "已完成",
}

const TASK_STATUS_LABELS: Record<string, string> = {
  pending: "未开始",
  in_progress: "进行中",
  blocked: "被阻塞",
  done: "已完成",
}

function truncateText(value: unknown, maxLen = 48) {
  const text =
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""
  if (!text) return ""
  return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text
}

export default defineComponent({
  name: "TaskPlanPanel",
  setup() {
    const taskPlanStore = useTaskPlanStore()
    const plan = computed<TaskPlan | null>(() => taskPlanStore.taskPlan)
    const expanded = ref(false)
    const hovering = ref(false)

    const progress = computed(() => {
      const tasks = plan.value?.tasks || []
      if (!tasks.length) return { done: 0, total: 0 }
      const done = tasks.filter((task: TaskItem) => task.status === "done").length
      return { done, total: tasks.length }
    })

    return () => {
      const current = plan.value
      if (!current) return null

      const tasks = Array.isArray(current.tasks) ? current.tasks : []
      const hasTasks = tasks.length > 0
      const currentTaskId =
        typeof current.currentTaskId === "string" ? current.currentTaskId : ""
      const currentTask =
        tasks.find((task: TaskItem) => task.id === currentTaskId) ||
        tasks.find((task: TaskItem) => task.status === "in_progress") ||
        tasks.find((task: TaskItem) => task.status === "pending") ||
        tasks[0] ||
        null
      const showDetails = expanded.value || hovering.value
      const visibleTasks = showDetails
        ? expanded.value
          ? tasks
          : currentTask
            ? [currentTask]
            : []
        : []
      const showToggle = tasks.length > 1
      const statusLabel = STATUS_LABELS[current.status] || current.status

      return (
        <section
          class="mt-3 rounded-2xl border border-slate-200 bg-white/80 p-3 text-sm text-slate-700 shadow-sm transition dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200"
          onMouseenter={() => {
            hovering.value = true
          }}
          onMouseleave={() => {
            if (!expanded.value) {
              hovering.value = false
            }
          }}
        >
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2 font-semibold">
                <span>
                  任务进度（{progress.value.done}/{progress.value.total}）
                </span>
                <span class="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  {statusLabel}
                </span>
              </div>
              {current.goal && (
                <div class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  目标：{truncateText(current.goal, 80)}
                </div>
              )}
            </div>
            {showToggle && showDetails && (
              <button
                class="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                onClick={() => {
                  expanded.value = !expanded.value
                }}
              >
                {expanded.value ? "收起列表" : "展开列表"}
              </button>
            )}
          </div>

          {showDetails && current.summary && (
            <div class="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-[11px] text-slate-600 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-300">
              {current.summary}
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
                  ) + 1 || index + 1
                return (
                  <div
                    class="rounded-xl border border-slate-200 bg-slate-50/60 p-2 text-xs dark:border-white/10 dark:bg-slate-900/40"
                    key={task.id || index}
                  >
                    <div class="flex items-center justify-between gap-2">
                      <div class="font-medium">
                        {displayIndex}. {task.title}
                      </div>
                      <span class="text-[11px] text-slate-500 dark:text-slate-400">
                        {TASK_STATUS_LABELS[task.status] || task.status}
                      </span>
                    </div>
                    <div class="mt-1 flex flex-wrap gap-1 text-[10px] text-slate-500 dark:text-slate-400">
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
                    {task.summary && (
                      <div class="mt-2 text-[11px] text-slate-600 dark:text-slate-300">
                        {task.summary}
                      </div>
                    )}
                    {Array.isArray(task.notes) && task.notes.length > 0 && (
                      <ul class="mt-2 list-disc pl-4 text-[11px] text-slate-500 dark:text-slate-400">
                        {task.notes.map((note: string, noteIndex: number) => (
                          <li key={`${task.id || index}-note-${noteIndex}`}>
                            {note}
                          </li>
                        ))}
                      </ul>
                    )}
                    {task.outcome && (
                      <div class="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                        {task.outcome}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {showDetails && current.status === "blocked" && (
            <div class="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              当前计划已阻塞。通常表示 Agent 正在等待用户补充信息、账号权限或风险确认。
            </div>
          )}

          {showDetails && current.outcome && (
            <div class="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200">
              {current.outcome}
            </div>
          )}
        </section>
      )
    }
  },
})
