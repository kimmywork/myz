import { defineComponent } from "vue";
import SelectStep from "./SelectStep.jsx";
import AuthorizeSteps from "./steps/AuthorizeSteps.jsx";
import CreateSteps from "./steps/CreateSteps.jsx";
import JoinSteps from "./steps/JoinSteps.jsx";
import { useSetupWizard, type SetupWizardApi } from "./useSetupWizard.js";

function renderBranch(w: SetupWizardApi) {
  if (w.scenario.value === "create") return <CreateSteps wizard={w} />;
  if (w.scenario.value === "join") return <JoinSteps wizard={w} />;
  return <AuthorizeSteps wizard={w} />;
}

/** Full-screen sync setup wizard shell (branch orchestration + chrome). */
export default defineComponent({
  name: "SetupWizard",
  setup() {
    const w = useSetupWizard();
    return () => (
      <section class="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
        <header class="flex flex-col gap-1">
          <div class="flex items-center justify-between gap-3">
            <h1 class="text-heading font-semibold text-text">设置同步</h1>
            {w.phase.value === "run" ? (
              <button
                class="btn-link text-caption"
                type="button"
                onClick={w.backToSelect}
              >
                重新选择
              </button>
            ) : null}
          </div>
          {w.phase.value === "select" ? (
            <p class="text-compact text-muted">
              选择场景后，按步骤完成加密同步配置。
            </p>
          ) : (
            <p class="text-compact text-muted">
              {w.scenarioTitle.value} · {w.step.value + 1}/
              {w.steps.value.length} {w.steps.value[w.step.value]}
            </p>
          )}
        </header>

        <div class="rounded-panel border border-line bg-surface p-5">
          {w.phase.value === "select" ? (
            <SelectStep wizard={w} />
          ) : (
            renderBranch(w)
          )}
          {w.status.value ? (
            <p
              class={`mt-4 text-caption ${w.statusToneClass.value}`}
              role="status"
              aria-live="polite"
            >
              {w.status.value}
            </p>
          ) : null}
        </div>

        {w.phase.value === "select" ? (
          <button
            class="btn btn-secondary self-start"
            type="button"
            onClick={w.finish}
          >
            返回设置
          </button>
        ) : null}
      </section>
    );
  },
});
