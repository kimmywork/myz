import { computed, reactive, ref } from "vue";
import { EMPTY_S3_FORM, type S3FormValue } from "./SetupS3Fields.jsx";
import {
  AUTHORIZE_STEPS,
  AUTHORIZE_STEPS_WITH_S3,
  CREATE_STEPS,
  JOIN_STEPS,
  type Phase,
  type Scenario,
  type SyncState,
  type Tone,
} from "./wizard-types.js";

/**
 * Holds every reactive value the wizard needs. Kept separate from the message
 * handlers so the state shape can be shared without pulling in transports.
 */
export function createWizardState() {
  const phase = ref<Phase>("select");
  const scenario = ref<Scenario>("create");
  const step = ref(0);
  const authorizeNeedsS3 = ref(false);
  const isBusy = ref(false);
  const status = ref("");
  const tone = ref<Tone>("info");

  const hasAccount = ref(false);
  const accountId = ref<string | null>(null);
  const deviceId = ref<string | null>(null);
  const epoch = ref(0);
  const lastSyncAt = ref<string | null>(null);
  const legacyKeysetPresent = ref(false);

  const s3 = reactive<S3FormValue>({ ...EMPTY_S3_FORM });
  const s3Tested = ref(false);

  const legacySecret = ref("");
  const showOldS3 = ref(false);
  const oldS3 = reactive<S3FormValue>({ ...EMPTY_S3_FORM });
  const migrationDone = ref(false);
  const rescuedCount = ref(0);

  const createdAccountId = ref("");
  const syncState = ref<SyncState>("idle");

  const pairingInvite = ref("");
  const pairingInviteInput = ref("");
  const pairingResponse = ref("");
  const pairingGuestSas = ref("");
  const pairingResponseInput = ref("");
  const pairingHostSas = ref("");
  const pairingRoster = ref("");
  const pairingImportInput = ref("");
  const sasConfirmed = ref(false);
  const copied = ref("");

  const steps = computed<string[]>(() => {
    if (scenario.value === "create") return CREATE_STEPS;
    if (scenario.value === "join") return JOIN_STEPS;
    return authorizeNeedsS3.value ? AUTHORIZE_STEPS_WITH_S3 : AUTHORIZE_STEPS;
  });

  const scenarioTitle = computed(() => {
    if (scenario.value === "create") return "新建账号";
    if (scenario.value === "join") return "加入已有账号";
    return "给新设备授权";
  });

  const statusToneClass = computed(() => {
    if (tone.value === "error") return "text-error";
    if (tone.value === "success") return "text-success";
    if (tone.value === "warn") return "text-warn";
    return "text-muted";
  });

  function setStatus(message: string, nextTone: Tone = "info") {
    status.value = message;
    tone.value = nextTone;
  }

  return {
    phase,
    scenario,
    step,
    authorizeNeedsS3,
    isBusy,
    status,
    tone,
    hasAccount,
    accountId,
    deviceId,
    epoch,
    lastSyncAt,
    legacyKeysetPresent,
    s3,
    s3Tested,
    legacySecret,
    showOldS3,
    oldS3,
    migrationDone,
    rescuedCount,
    createdAccountId,
    syncState,
    pairingInvite,
    pairingInviteInput,
    pairingResponse,
    pairingGuestSas,
    pairingResponseInput,
    pairingHostSas,
    pairingRoster,
    pairingImportInput,
    sasConfirmed,
    copied,
    steps,
    scenarioTitle,
    statusToneClass,
    setStatus,
  };
}

export type WizardState = ReturnType<typeof createWizardState>;
