import {
  Check,
  ClipboardCopy,
  Cloud,
  Loader2,
  ShieldCheck,
  TriangleAlert,
} from "@lucide/vue";
import { sendMessage } from "@myz/shared/messaging";
import { computed, defineComponent, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSettingsStore } from "../../stores/settings.js";
import SetupS3Fields, {
  EMPTY_S3_FORM,
  setupInputClass,
  toS3Form,
  validateS3Form,
  type S3FormValue,
} from "./SetupS3Fields.jsx";

type Scenario = "create" | "join" | "authorize";
type Phase = "select" | "run";
type Tone = "info" | "error" | "success" | "warn";

interface SyncStatusResult {
  hasAccount: boolean;
  accountId: string | null;
  deviceId: string | null;
  epoch: number;
  keyId: string | null;
  lastSyncAt: string | null;
}

interface PairingS3Prefill {
  endpoint: string;
  region: string;
  bucket: string;
  prefix?: string;
}

const CREATE_STEPS = ["S3 存储", "迁移旧数据", "创建账号", "首次同步", "完成"];
const JOIN_STEPS = ["S3 存储", "获取邀请", "核对短码", "完成加入", "首次同步"];
const AUTHORIZE_STEPS = ["生成邀请", "新设备响应", "核对并批准"];
const AUTHORIZE_STEPS_WITH_S3 = ["S3 存储", ...AUTHORIZE_STEPS];

export default defineComponent({
  name: "SetupWizard",
  setup() {
    const router = useRouter();
    const route = useRoute();
    const settingsStore = useSettingsStore();

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
    const syncState = ref<"idle" | "running" | "done" | "failed" | "later">(
      "idle",
    );

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

    function setStatus(message: string, nextTone: Tone = "info") {
      status.value = message;
      tone.value = nextTone;
    }

    function s3FromSettings() {
      const current = settingsStore.settings.sync?.s3;
      Object.assign(s3, toS3Form(current));
    }

    async function loadStatus() {
      try {
        const result = await sendMessage<undefined, SyncStatusResult>(
          "myz:syncStatus",
        );
        hasAccount.value = Boolean(result?.hasAccount);
        accountId.value = result?.accountId || null;
        deviceId.value = result?.deviceId || null;
        epoch.value = result?.epoch || 0;
        lastSyncAt.value = result?.lastSyncAt || null;
        legacyKeysetPresent.value = Boolean(result?.keyId);
      } catch (error) {
        setStatus(`读取同步状态失败：${(error as Error).message}`, "error");
      }
    }

    function startScenario(next: Scenario) {
      scenario.value = next;
      if (next === "authorize") {
        authorizeNeedsS3.value = Boolean(validateS3Form(s3));
      }
      step.value = 0;
      phase.value = "run";
      status.value = "";
      tone.value = "info";
    }

    function backToSelect() {
      phase.value = "select";
      step.value = 0;
      status.value = "";
      tone.value = "info";
    }

    function back() {
      if (step.value === 0) {
        backToSelect();
        return;
      }
      step.value -= 1;
      status.value = "";
      tone.value = "info";
    }

    function finish() {
      void router.push("/settings/sync");
    }

    async function copyText(label: string, text: string) {
      try {
        await navigator.clipboard.writeText(text);
        copied.value = label;
        window.setTimeout(() => {
          if (copied.value === label) copied.value = "";
        }, 1500);
      } catch {
        setStatus("复制失败，请手动选择文本复制", "error");
      }
    }

    async function persistS3(): Promise<boolean> {
      const error = validateS3Form(s3);
      if (error) {
        setStatus(error, "error");
        return false;
      }
      await settingsStore.saveSettings({
        sync: { enabled: true, s3: { ...s3 } },
      });
      return true;
    }

    async function handleTestConnection() {
      const error = validateS3Form(s3);
      if (error) {
        s3Tested.value = false;
        setStatus(error, "error");
        return;
      }
      isBusy.value = true;
      setStatus("测试连接中…", "info");
      try {
        const result = await sendMessage<
          { s3: S3FormValue },
          { ok: boolean; message?: string }
        >("myz:syncTestConnection", { s3: { ...s3 } });
        s3Tested.value = Boolean(result?.ok);
        setStatus(
          result?.ok ? "连接成功" : result?.message || "连接失败",
          result?.ok ? "success" : "error",
        );
      } catch (err) {
        s3Tested.value = false;
        setStatus(`连接失败：${(err as Error).message}`, "error");
      } finally {
        isBusy.value = false;
      }
    }

    async function saveS3AndGo(target: number) {
      if (isBusy.value) return;
      isBusy.value = true;
      try {
        if (!(await persistS3())) return;
        step.value = target;
        s3Tested.value = true;
        setStatus("", "info");
      } catch (err) {
        setStatus(`保存失败：${(err as Error).message}`, "error");
      } finally {
        isBusy.value = false;
      }
    }

    async function handleMigrate() {
      if (isBusy.value) return;
      isBusy.value = true;
      setStatus("迁移中…", "info");
      try {
        const result = await sendMessage<
          {
            secret?: string;
            s3?: Partial<S3FormValue>;
            userGesture: boolean;
          },
          { rescued: number; hasLegacy: boolean }
        >("myz:accountMigrateLegacy", {
          secret: legacySecret.value.trim() || undefined,
          s3: showOldS3.value ? { ...oldS3 } : undefined,
          userGesture: true,
        });
        rescuedCount.value = result?.rescued || 0;
        migrationDone.value = true;
        if (!result?.hasLegacy) {
          setStatus("未检测到旧格式数据，无需迁移", "info");
        } else {
          setStatus(`已合并 ${result.rescued} 条旧记录`, "success");
        }
      } catch (err) {
        setStatus(`迁移失败：${(err as Error).message}`, "error");
      } finally {
        isBusy.value = false;
      }
    }

    function skipMigration() {
      migrationDone.value = true;
      setStatus("未检测到旧格式数据，无需迁移", "info");
    }

    async function handleCreateAccount() {
      if (isBusy.value) return;
      isBusy.value = true;
      setStatus("创建账号中…", "info");
      try {
        const result = await sendMessage<
          { userGesture: boolean },
          { accountId: string }
        >("myz:accountCreate", { userGesture: true });
        createdAccountId.value = result.accountId;
        await loadStatus();
        setStatus("账号已创建", "success");
      } catch (err) {
        setStatus(`创建账号失败：${(err as Error).message}`, "error");
      } finally {
        isBusy.value = false;
      }
    }

    async function handleSyncNow() {
      if (isBusy.value) return;
      isBusy.value = true;
      syncState.value = "running";
      setStatus("正在上传本机数据…", "info");
      try {
        const result = await sendMessage<
          undefined,
          { ok: boolean; status?: string; message?: string }
        >("myz:syncNow");
        if (result?.ok) {
          await loadStatus();
          syncState.value = "done";
          setStatus("首次同步完成", "success");
        } else {
          syncState.value = "failed";
          setStatus(result?.message || "同步失败", "error");
        }
      } catch (err) {
        syncState.value = "failed";
        setStatus(`同步失败：${(err as Error).message}`, "error");
      } finally {
        isBusy.value = false;
      }
    }

    function handleSyncLater() {
      syncState.value = "later";
      setStatus("已保存，可稍后在设置页同步", "warn");
    }

    async function handleAcceptInvite() {
      if (isBusy.value) return;
      if (!pairingInviteInput.value.trim()) {
        setStatus("请粘贴邀请串", "error");
        return;
      }
      isBusy.value = true;
      setStatus("解析邀请中…", "info");
      try {
        const result = await sendMessage<
          { invite: string; userGesture: boolean },
          { response: string; sas: string; s3?: PairingS3Prefill }
        >("myz:pairingAccept", {
          invite: pairingInviteInput.value.trim(),
          userGesture: true,
        });
        pairingResponse.value = result.response;
        pairingGuestSas.value = result.sas;
        if (result.s3) {
          if (!s3.endpoint) s3.endpoint = result.s3.endpoint;
          if (!s3.region && result.s3.region) s3.region = result.s3.region;
          if (!s3.bucket) s3.bucket = result.s3.bucket;
          if (!s3.prefix && result.s3.prefix) s3.prefix = result.s3.prefix;
          s3Tested.value = false;
          // Persist the merged non-sensitive coordinates so the first sync
          // actually uses them (credentials were saved in the S3 step).
          await persistS3().catch(() => {});
        }
        step.value = 2;
        setStatus("已生成响应，请发回已有设备并核对短码", "success");
      } catch (err) {
        setStatus(`邀请无效或已过期：${(err as Error).message}`, "error");
      } finally {
        isBusy.value = false;
      }
    }

    async function handleImportAccount() {
      if (isBusy.value) return;
      if (!sasConfirmed.value) {
        setStatus("请先确认已有设备短码与本机一致", "error");
        return;
      }
      if (!pairingImportInput.value.trim()) {
        setStatus("请粘贴配对串", "error");
        return;
      }
      isBusy.value = true;
      setStatus("加入账号中…", "info");
      try {
        await sendMessage("myz:accountImport", {
          roster: pairingImportInput.value.trim(),
          userGesture: true,
        });
        await loadStatus();
        step.value = 4;
        setStatus("已加入账号，请完成首次同步", "success");
      } catch (err) {
        setStatus(`配对串无效或尚未被批准：${(err as Error).message}`, "error");
      } finally {
        isBusy.value = false;
      }
    }

    async function handleGenerateInvite() {
      if (isBusy.value) return;
      isBusy.value = true;
      setStatus("生成邀请中…", "info");
      try {
        const result = await sendMessage<
          { userGesture: boolean },
          { offer: string }
        >("myz:pairingInvite", { userGesture: true });
        pairingInvite.value = result.offer;
        setStatus("邀请已生成，请发送给新设备", "success");
      } catch (err) {
        setStatus(`生成失败：${(err as Error).message}`, "error");
      } finally {
        isBusy.value = false;
      }
    }

    async function handleApprove() {
      if (isBusy.value) return;
      if (!pairingResponseInput.value.trim()) {
        setStatus("请粘贴响应串", "error");
        return;
      }
      isBusy.value = true;
      setStatus("批准中…", "info");
      try {
        const result = await sendMessage<
          { response: string; userGesture: boolean },
          { sas: string; roster: string }
        >("myz:pairingApprove", {
          response: pairingResponseInput.value.trim(),
          userGesture: true,
        });
        pairingHostSas.value = result.sas;
        pairingRoster.value = result.roster;
        await loadStatus();
        setStatus("设备已加入，请核对短码并把配对串发回新设备", "success");
      } catch (err) {
        setStatus(`批准失败：${(err as Error).message}`, "error");
      } finally {
        isBusy.value = false;
      }
    }

    onMounted(async () => {
      await settingsStore.loadSettings().catch(() => {});
      s3FromSettings();
      await loadStatus();
      const requested = route.query.scenario;
      if (requested === "authorize" && hasAccount.value) {
        startScenario("authorize");
      } else if (requested === "join" && !hasAccount.value) {
        startScenario("join");
      } else if (requested === "create" && !hasAccount.value) {
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

    const statusToneClass = computed(() => {
      if (tone.value === "error") return "text-error";
      if (tone.value === "success") return "text-success";
      if (tone.value === "warn") return "text-warn";
      return "text-muted";
    });

    interface Slots {
      default?: () => unknown;
    }

    function Notice(
      props: { tone?: Tone; icon?: typeof Cloud },
      { slots }: { slots: Slots },
    ) {
      const Icon = props.icon ?? Cloud;
      const cls =
        props.tone === "error"
          ? "border-error-border bg-error-bg text-error"
          : props.tone === "success"
            ? "border-success-border bg-success-bg text-success"
            : props.tone === "warn"
              ? "border-warn-border bg-warn-bg text-warn"
              : "border-line bg-surface-2 text-muted";
      return (
        <div
          class={`flex items-start gap-2 rounded-control border px-3 py-2 text-caption ${cls}`}
        >
          <Icon size={15} aria-hidden="true" class="mt-0.5 shrink-0" />
          <div class="min-w-0">{slots.default?.()}</div>
        </div>
      );
    }

    function CopyButton(props: { label: string; text: string }) {
      return (
        <button
          class="btn btn-small shrink-0"
          type="button"
          disabled={!props.text}
          onClick={() => copyText(props.label, props.text)}
        >
          <ClipboardCopy size={14} aria-hidden="true" />
          {copied.value === props.label ? "已复制" : "复制"}
        </button>
      );
    }

    function OutputBlock(props: {
      label: string;
      text: string;
      rows?: number;
    }) {
      return (
        <div class="flex flex-col gap-1.5">
          <div class="flex items-center justify-between gap-2">
            <span class="text-caption font-medium text-text">
              {props.label}
            </span>
            <CopyButton label={props.label} text={props.text} />
          </div>
          <textarea
            readonly
            rows={props.rows || 3}
            aria-label={props.label}
            class={`${setupInputClass} font-mono text-tag`}
            value={props.text}
          />
        </div>
      );
    }

    function SasDisplay(props: { label: string; sas: string }) {
      return (
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-caption text-muted">{props.label}</span>
          <span class="text-title font-semibold tracking-[0.25em] text-text">
            {props.sas}
          </span>
        </div>
      );
    }

    function Footer(_props: object, { slots }: { slots: Slots }) {
      const atFirstStep = step.value === 0;
      return (
        <div class="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <button
            class="btn btn-secondary"
            type="button"
            disabled={isBusy.value}
            onClick={() => (atFirstStep ? backToSelect() : back())}
          >
            {atFirstStep ? "返回" : "上一步"}
          </button>
          <div class="flex flex-wrap items-center gap-2">
            {slots.default?.()}
          </div>
        </div>
      );
    }

    function renderScenarioSelect() {
      const options: Array<{
        key: Scenario;
        title: string;
        desc: string;
        enabled: boolean;
        note: string;
      }> = [
        {
          key: "join",
          title: "加入已有账号",
          desc: "这是一台新设备，从已有设备获取邀请并加入。",
          enabled: !hasAccount.value,
          note: hasAccount.value ? "本机已配置同步账号" : "",
        },
        {
          key: "create",
          title: "新建账号",
          desc: "这是第一台设备，创建加密同步账号并上传本机数据。",
          enabled: !hasAccount.value,
          note: hasAccount.value ? "本机已配置同步账号" : "",
        },
        {
          key: "authorize",
          title: "给新设备授权",
          desc: "本机已有账号，为另一台新设备生成配对邀请并批准。",
          enabled: hasAccount.value,
          note: hasAccount.value ? "" : "请先在已有设备上创建账号",
        },
      ];
      return (
        <div class="grid gap-3">
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              disabled={!option.enabled}
              class="flex flex-col gap-1 rounded-panel border border-line bg-surface p-4 text-left transition hover:border-accent disabled:pointer-events-none disabled:opacity-50"
              onClick={() => startScenario(option.key)}
            >
              <span class="text-title font-semibold text-text">
                {option.title}
              </span>
              <span class="text-caption text-muted">{option.desc}</span>
              {option.note ? (
                <span class="text-caption text-warn">{option.note}</span>
              ) : null}
            </button>
          ))}
        </div>
      );
    }

    function renderCreateStep() {
      if (step.value === 0) {
        return (
          <>
            <div class="grid gap-3">
              <SetupS3Fields
                value={s3}
                disabled={isBusy.value}
                onUpdate={(field, value) => {
                  s3[field] = value;
                  s3Tested.value = false;
                }}
              />
              <Notice>
                仅密文上传到 S3。Endpoint 必须是 https://（仅
                localhost/127.0.0.1 可用 http）。测试通过后才能继续。
              </Notice>
            </div>
            <Footer>
              <button
                class="btn"
                type="button"
                disabled={isBusy.value}
                onClick={handleTestConnection}
              >
                {isBusy.value ? (
                  <Loader2 size={15} class="animate-spin" aria-hidden="true" />
                ) : null}
                测试连接
              </button>
              <button
                class="btn btn-primary"
                type="button"
                disabled={isBusy.value || !s3Tested.value}
                onClick={() => saveS3AndGo(1)}
              >
                下一步
              </button>
            </Footer>
          </>
        );
      }
      if (step.value === 1) {
        return (
          <>
            <div class="grid gap-3">
              <Notice>
                若你以前用旧格式同步过，这里会把旧云端记录一次性合并到新账号，然后清理旧密钥。
              </Notice>
              {legacyKeysetPresent.value ? (
                <>
                  <label class="flex flex-col gap-1.5">
                    <span class="text-caption font-medium text-text">
                      旧同步密钥（可选，留空则用本机已保存的旧密钥）
                    </span>
                    <input
                      type="password"
                      class={setupInputClass}
                      aria-label="旧同步密钥"
                      placeholder="仅保留在本地"
                      value={legacySecret.value}
                      onInput={(event: InputEvent) =>
                        (legacySecret.value = (
                          event.target as HTMLInputElement
                        ).value)
                      }
                    />
                  </label>
                  <label class="flex items-center gap-2 text-caption text-text">
                    <input
                      type="checkbox"
                      checked={showOldS3.value}
                      onChange={(event: Event) =>
                        (showOldS3.value = (
                          event.target as HTMLInputElement
                        ).checked)
                      }
                    />
                    旧 S3 与上面不同？展开单独填写
                  </label>
                  {showOldS3.value ? (
                    <SetupS3Fields
                      value={oldS3}
                      disabled={isBusy.value}
                      onUpdate={(field, value) => {
                        oldS3[field] = value;
                      }}
                    />
                  ) : null}
                  {migrationDone.value ? (
                    <Notice tone="success" icon={Check}>
                      已合并 {rescuedCount.value} 条旧记录
                    </Notice>
                  ) : null}
                  <Notice tone="warn" icon={TriangleAlert}>
                    迁移失败可重试；也可继续（仅旧云端记录可能丢失）。
                  </Notice>
                </>
              ) : (
                <Notice>未检测到旧格式数据，无需迁移。可直接继续。</Notice>
              )}
            </div>
            <Footer>
              {legacyKeysetPresent.value ? (
                migrationDone.value ? (
                  <button
                    class="btn btn-primary"
                    type="button"
                    disabled={isBusy.value}
                    onClick={() => {
                      step.value = 2;
                      setStatus("", "info");
                    }}
                  >
                    下一步
                  </button>
                ) : (
                  <>
                    <button
                      class="btn"
                      type="button"
                      disabled={isBusy.value}
                      onClick={handleMigrate}
                    >
                      迁移
                    </button>
                    <button
                      class="btn btn-secondary"
                      type="button"
                      disabled={isBusy.value}
                      onClick={() => {
                        step.value = 2;
                        setStatus("", "info");
                      }}
                    >
                      跳过
                    </button>
                  </>
                )
              ) : (
                <button
                  class="btn btn-primary"
                  type="button"
                  disabled={isBusy.value}
                  onClick={() => {
                    skipMigration();
                    step.value = 2;
                    setStatus("", "info");
                  }}
                >
                  下一步
                </button>
              )}
            </Footer>
          </>
        );
      }
      if (step.value === 2) {
        return (
          <>
            <div class="grid gap-3">
              <Notice tone="warn" icon={TriangleAlert}>
                无 A-only
                恢复：请保留至少一台已授权设备；设备全丢则数据不可恢复。
              </Notice>
              {createdAccountId.value ? (
                <OutputBlock label="Account ID" text={createdAccountId.value} />
              ) : (
                <button
                  class="btn btn-primary self-start"
                  type="button"
                  disabled={isBusy.value}
                  onClick={handleCreateAccount}
                >
                  {isBusy.value ? (
                    <Loader2
                      size={15}
                      class="animate-spin"
                      aria-hidden="true"
                    />
                  ) : null}
                  创建同步账号
                </button>
              )}
            </div>
            <Footer>
              <button
                class="btn btn-primary"
                type="button"
                disabled={isBusy.value || !createdAccountId.value}
                onClick={() => {
                  step.value = 3;
                  setStatus("", "info");
                }}
              >
                下一步
              </button>
            </Footer>
          </>
        );
      }
      if (step.value === 3) {
        return renderSyncSection();
      }
      return renderDoneStep();
    }

    function renderSyncSection() {
      return (
        <>
          <div class="grid gap-3">
            {syncState.value === "idle" ? (
              <Notice>
                正在把本机数据加密上传到 S3。稍后同步不会丢失本机数据。
              </Notice>
            ) : null}
            {syncState.value === "running" ? (
              <Notice>
                <span class="inline-flex items-center gap-2">
                  <Loader2 size={15} class="animate-spin" aria-hidden="true" />
                  正在上传本机数据…
                </span>
              </Notice>
            ) : null}
            {syncState.value === "done" ? (
              <Notice tone="success" icon={Check}>
                首次同步完成。
              </Notice>
            ) : null}
            {syncState.value === "failed" ? (
              <Notice tone="error" icon={TriangleAlert}>
                同步失败，可重试，或稍后在设置页同步。
              </Notice>
            ) : null}
            {syncState.value === "later" ? (
              <Notice tone="warn" icon={TriangleAlert}>
                已标记为「未完成同步」，可稍后在设置页点击「立即同步」。
              </Notice>
            ) : null}
          </div>
          <Footer>
            {syncState.value === "done" || syncState.value === "later" ? (
              <button
                class="btn btn-primary"
                type="button"
                onClick={() => {
                  if (scenario.value === "join") {
                    finish();
                  } else {
                    step.value = 4;
                    setStatus("", "info");
                  }
                }}
              >
                {scenario.value === "join" ? "完成" : "下一步"}
              </button>
            ) : (
              <>
                <button
                  class="btn btn-primary"
                  type="button"
                  disabled={isBusy.value}
                  onClick={handleSyncNow}
                >
                  开始同步
                </button>
                <button
                  class="btn btn-secondary"
                  type="button"
                  disabled={isBusy.value}
                  onClick={handleSyncLater}
                >
                  稍后同步
                </button>
              </>
            )}
          </Footer>
        </>
      );
    }

    function renderDoneStep() {
      return (
        <>
          <div class="grid gap-3">
            <Notice
              tone={syncState.value === "done" ? "success" : "warn"}
              icon={syncState.value === "done" ? Check : TriangleAlert}
            >
              {syncState.value === "done"
                ? "账号已建立并完成首次同步。"
                : "账号已建立，但尚未完成首次同步。可稍后在设置页同步。"}
            </Notice>
            {accountId.value ? (
              <OutputBlock label="Account ID" text={accountId.value} />
            ) : null}
          </div>
          <Footer>
            <button
              class="btn"
              type="button"
              onClick={() => startScenario("authorize")}
            >
              添加新设备
            </button>
            <button class="btn btn-primary" type="button" onClick={finish}>
              完成
            </button>
          </Footer>
        </>
      );
    }

    function renderJoinStep() {
      if (step.value === 0) {
        return (
          <>
            <div class="grid gap-3">
              <SetupS3Fields
                value={s3}
                disabled={isBusy.value}
                onUpdate={(field, value) => {
                  s3[field] = value;
                  s3Tested.value = false;
                }}
              />
              <Notice>
                邀请串会自动带入服务器地址；Access Key / Secret
                需要你自行填写。测试通过后才能继续。
              </Notice>
            </div>
            <Footer>
              <button
                class="btn"
                type="button"
                disabled={isBusy.value}
                onClick={handleTestConnection}
              >
                {isBusy.value ? (
                  <Loader2 size={15} class="animate-spin" aria-hidden="true" />
                ) : null}
                测试连接
              </button>
              <button
                class="btn btn-primary"
                type="button"
                disabled={isBusy.value || !s3Tested.value}
                onClick={() => saveS3AndGo(1)}
              >
                下一步
              </button>
            </Footer>
          </>
        );
      }
      if (step.value === 1) {
        return (
          <>
            <div class="grid gap-3">
              <Notice>
                请在【已有设备】上：设置 → 加密同步 → 添加新设备 →
                生成配对邀请，然后把邀请串发给我。
              </Notice>
              <label class="flex flex-col gap-1.5">
                <span class="text-caption font-medium text-text">邀请串</span>
                <textarea
                  rows={4}
                  aria-label="邀请串"
                  class={`${setupInputClass} font-mono text-tag`}
                  placeholder="粘贴邀请串…"
                  value={pairingInviteInput.value}
                  onInput={(event: Event) =>
                    (pairingInviteInput.value = (
                      event.target as HTMLTextAreaElement
                    ).value)
                  }
                />
              </label>
            </div>
            <Footer>
              <button
                class="btn btn-primary"
                type="button"
                disabled={isBusy.value || !pairingInviteInput.value.trim()}
                onClick={handleAcceptInvite}
              >
                {isBusy.value ? (
                  <Loader2 size={15} class="animate-spin" aria-hidden="true" />
                ) : null}
                解析邀请
              </button>
            </Footer>
          </>
        );
      }
      if (step.value === 2) {
        return (
          <>
            <div class="grid gap-3">
              <SasDisplay label="本机短码：" sas={pairingGuestSas.value} />
              <Notice tone="warn" icon={ShieldCheck}>
                把响应串发回已有设备；已有设备会显示它的短码，两边必须一致。
              </Notice>
              <OutputBlock label="响应串" text={pairingResponse.value} />
            </div>
            <Footer>
              <button
                class="btn btn-primary"
                type="button"
                disabled={isBusy.value}
                onClick={() => {
                  step.value = 3;
                  setStatus("", "info");
                }}
              >
                下一步
              </button>
            </Footer>
          </>
        );
      }
      if (step.value === 3) {
        return (
          <>
            <div class="grid gap-3">
              <Notice>已有设备批准后会给你一串【配对串】。粘贴到下面。</Notice>
              <label class="flex flex-col gap-1.5">
                <span class="text-caption font-medium text-text">配对串</span>
                <textarea
                  rows={4}
                  aria-label="配对串"
                  class={`${setupInputClass} font-mono text-tag`}
                  placeholder="粘贴配对串…"
                  value={pairingImportInput.value}
                  onInput={(event: Event) =>
                    (pairingImportInput.value = (
                      event.target as HTMLTextAreaElement
                    ).value)
                  }
                />
              </label>
              <label class="flex items-center gap-2 text-compact text-text">
                <input
                  type="checkbox"
                  checked={sasConfirmed.value}
                  onChange={(event: Event) =>
                    (sasConfirmed.value = (
                      event.target as HTMLInputElement
                    ).checked)
                  }
                />
                我已确认：已有设备短码与本机一致（
                {pairingGuestSas.value || "——"}）
              </label>
            </div>
            <Footer>
              <button
                class="btn btn-primary"
                type="button"
                disabled={
                  isBusy.value ||
                  !sasConfirmed.value ||
                  !pairingImportInput.value.trim()
                }
                onClick={handleImportAccount}
              >
                完成加入
              </button>
            </Footer>
          </>
        );
      }
      return renderSyncSection();
    }

    function renderAuthorizeStep() {
      const offset = authorizeNeedsS3.value ? 1 : 0;
      if (offset === 1 && step.value === 0) {
        return (
          <>
            <div class="grid gap-3">
              <SetupS3Fields
                value={s3}
                disabled={isBusy.value}
                onUpdate={(field, value) => {
                  s3[field] = value;
                  s3Tested.value = false;
                }}
              />
              <Notice>本机尚未完成 S3 配置，请先填写并测试连接。</Notice>
            </div>
            <Footer>
              <button
                class="btn"
                type="button"
                disabled={isBusy.value}
                onClick={handleTestConnection}
              >
                {isBusy.value ? (
                  <Loader2 size={15} class="animate-spin" aria-hidden="true" />
                ) : null}
                测试连接
              </button>
              <button
                class="btn btn-primary"
                type="button"
                disabled={isBusy.value || !s3Tested.value}
                onClick={() => saveS3AndGo(1)}
              >
                下一步
              </button>
            </Footer>
          </>
        );
      }
      const local = step.value - offset;
      if (local === 0) {
        return (
          <>
            <div class="grid gap-3">
              <Notice>
                在【新设备】上打开设置同步向导，选择「加入已有账号」。
              </Notice>
              <button
                class="btn btn-primary self-start"
                type="button"
                disabled={isBusy.value}
                onClick={handleGenerateInvite}
              >
                {isBusy.value ? (
                  <Loader2 size={15} class="animate-spin" aria-hidden="true" />
                ) : null}
                生成配对邀请
              </button>
              {pairingInvite.value ? (
                <OutputBlock label="邀请串" text={pairingInvite.value} />
              ) : null}
            </div>
            <Footer>
              <button
                class="btn btn-primary"
                type="button"
                disabled={isBusy.value || !pairingInvite.value}
                onClick={() => {
                  step.value = offset + 1;
                  setStatus("", "info");
                }}
              >
                下一步
              </button>
            </Footer>
          </>
        );
      }
      if (local === 1) {
        return (
          <>
            <div class="grid gap-3">
              <Notice>
                把【响应串】从新设备粘贴到这里，然后在下一步核对短码。
              </Notice>
              <label class="flex flex-col gap-1.5">
                <span class="text-caption font-medium text-text">响应串</span>
                <textarea
                  rows={4}
                  aria-label="响应串"
                  class={`${setupInputClass} font-mono text-tag`}
                  placeholder="粘贴响应串…"
                  value={pairingResponseInput.value}
                  onInput={(event: Event) =>
                    (pairingResponseInput.value = (
                      event.target as HTMLTextAreaElement
                    ).value)
                  }
                />
              </label>
            </div>
            <Footer>
              <button
                class="btn btn-primary"
                type="button"
                disabled={isBusy.value || !pairingResponseInput.value.trim()}
                onClick={() => {
                  step.value = offset + 2;
                  setStatus("", "info");
                }}
              >
                下一步
              </button>
            </Footer>
          </>
        );
      }
      return (
        <>
          <div class="grid gap-3">
            {pairingHostSas.value ? (
              <SasDisplay label="本机短码：" sas={pairingHostSas.value} />
            ) : null}
            {!pairingRoster.value ? (
              <button
                class="btn btn-primary self-start"
                type="button"
                disabled={isBusy.value}
                onClick={handleApprove}
              >
                {isBusy.value ? (
                  <Loader2 size={15} class="animate-spin" aria-hidden="true" />
                ) : null}
                批准并加入设备
              </button>
            ) : null}
            {pairingRoster.value ? (
              <>
                <label class="flex items-center gap-2 text-compact text-text">
                  <input
                    type="checkbox"
                    checked={sasConfirmed.value}
                    onChange={(event: Event) =>
                      (sasConfirmed.value = (
                        event.target as HTMLInputElement
                      ).checked)
                    }
                  />
                  我已确认与新设备短码一致（{pairingHostSas.value}）
                </label>
                <Notice tone="warn" icon={ShieldCheck}>
                  批准后把【配对串】发回新设备，让它在向导里粘贴完成加入。
                </Notice>
                <OutputBlock label="配对串" text={pairingRoster.value} />
              </>
            ) : null}
          </div>
          <Footer>
            <button
              class="btn btn-primary"
              type="button"
              disabled={!pairingRoster.value || !sasConfirmed.value}
              onClick={finish}
            >
              完成
            </button>
          </Footer>
        </>
      );
    }

    function renderRun() {
      if (scenario.value === "create") return renderCreateStep();
      if (scenario.value === "join") return renderJoinStep();
      return renderAuthorizeStep();
    }

    return () => (
      <section class="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
        <header class="flex flex-col gap-1">
          <div class="flex items-center justify-between gap-3">
            <h1 class="text-heading font-semibold text-text">设置同步</h1>
            {phase.value === "run" ? (
              <button
                class="btn-link text-caption"
                type="button"
                onClick={backToSelect}
              >
                重新选择
              </button>
            ) : null}
          </div>
          {phase.value === "select" ? (
            <p class="text-compact text-muted">
              选择场景后，按步骤完成加密同步配置。
            </p>
          ) : (
            <p class="text-compact text-muted">
              {scenarioTitle.value} · {step.value + 1}/{steps.value.length}{" "}
              {steps.value[step.value]}
            </p>
          )}
        </header>

        <div class="rounded-panel border border-line bg-surface p-5">
          {phase.value === "select" ? renderScenarioSelect() : renderRun()}
          {status.value ? (
            <p
              class={`mt-4 text-caption ${statusToneClass.value}`}
              role="status"
              aria-live="polite"
            >
              {status.value}
            </p>
          ) : null}
        </div>

        {phase.value === "select" ? (
          <button
            class="btn btn-secondary self-start"
            type="button"
            onClick={finish}
          >
            返回设置
          </button>
        ) : null}
      </section>
    );
  },
});
