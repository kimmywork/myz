import { onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSettingsStore } from "../../stores/settings.js";
import { validateS3Form } from "./SetupS3Fields.jsx";
import { createAccountActions } from "./wizard-account-actions.js";
import { createPairingActions } from "./wizard-pairing-actions.js";
import { createWizardState } from "./wizard-state.js";
import type { Scenario } from "./wizard-types.js";

/**
 * Composition root for the sync setup wizard: owns state, message handlers,
 * navigation and the first-run flag. Components receive the returned API.
 */
export function useSetupWizard() {
  const router = useRouter();
  const route = useRoute();
  const settingsStore = useSettingsStore();
  const state = createWizardState();
  const account = createAccountActions(state, settingsStore);
  const pairing = createPairingActions(state, {
    persistS3: account.persistS3,
    loadStatus: account.loadStatus,
  });

  function startScenario(next: Scenario) {
    state.scenario.value = next;
    if (next === "authorize") {
      state.authorizeNeedsS3.value = Boolean(validateS3Form(state.s3));
    }
    state.step.value = 0;
    state.phase.value = "run";
    state.setStatus("", "info");
  }

  function backToSelect() {
    state.phase.value = "select";
    state.step.value = 0;
    state.setStatus("", "info");
  }

  function back() {
    if (state.step.value === 0) {
      backToSelect();
      return;
    }
    state.step.value -= 1;
    state.setStatus("", "info");
  }

  function finish() {
    void router.push("/settings/sync");
  }

  onMounted(async () => {
    await settingsStore.loadSettings().catch(() => {});
    account.s3FromSettings();
    await account.loadStatus();
    const requested = route.query.scenario;
    if (requested === "authorize" && state.hasAccount.value) {
      startScenario("authorize");
    } else if (requested === "join" && !state.hasAccount.value) {
      startScenario("join");
    } else if (requested === "create" && !state.hasAccount.value) {
      startScenario("create");
    }
    if (!settingsStore.settings.syncSetupSeen) {
      try {
        await settingsStore.saveSettings({ syncSetupSeen: true });
      } catch {
        // non-fatal; the wizard still works if the flag cannot be saved
      }
    }
  });

  return {
    ...state,
    ...account,
    ...pairing,
    startScenario,
    backToSelect,
    back,
    finish,
  };
}

export type SetupWizardApi = ReturnType<typeof useSetupWizard>;
