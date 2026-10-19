import type { WizardState } from "./wizard-state.js";
import { invoke } from "@/messaging/invoke";

interface PairingDeps {
  persistS3: () => Promise<boolean>;
  loadStatus: () => Promise<void>;
}

/** Copy + guest/host pairing handlers. */
export function createPairingActions(state: WizardState, deps: PairingDeps) {
  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      state.copied.value = label;
      window.setTimeout(() => {
        if (state.copied.value === label) state.copied.value = "";
      }, 1500);
    } catch {
      state.setStatus("复制失败，请手动选择文本复制", "error");
    }
  }

  async function handleAcceptInvite() {
    if (state.isBusy.value) return;
    if (!state.pairingInviteInput.value.trim()) {
      state.setStatus("请粘贴邀请串", "error");
      return;
    }
    state.isBusy.value = true;
    state.setStatus("解析邀请中…", "info");
    try {
      const result = await invoke("myz:pairingAccept", {
        invite: state.pairingInviteInput.value.trim(),
        userGesture: true,
      });
      state.pairingResponse.value = result.response;
      state.pairingGuestSas.value = result.sas;
      if (result.s3) {
        if (!state.s3.endpoint) state.s3.endpoint = result.s3.endpoint;
        if (!state.s3.region && result.s3.region)
          state.s3.region = result.s3.region;
        if (!state.s3.bucket) state.s3.bucket = result.s3.bucket;
        if (!state.s3.prefix && result.s3.prefix)
          state.s3.prefix = result.s3.prefix;
        state.s3Tested.value = false;
        // Persist the merged non-sensitive coordinates so the first sync
        // actually uses them (credentials were saved in the S3 step).
        await deps.persistS3().catch(() => {});
      }
      state.step.value = 2;
      state.setStatus("已生成响应，请发回已有设备并核对短码", "success");
    } catch (err) {
      state.setStatus(`邀请无效或已过期：${(err as Error).message}`, "error");
    } finally {
      state.isBusy.value = false;
    }
  }

  async function handleImportAccount() {
    if (state.isBusy.value) return;
    if (!state.sasConfirmed.value) {
      state.setStatus("请先确认已有设备短码与本机一致", "error");
      return;
    }
    if (!state.pairingImportInput.value.trim()) {
      state.setStatus("请粘贴配对串", "error");
      return;
    }
    state.isBusy.value = true;
    state.setStatus("加入账号中…", "info");
    try {
      await invoke("myz:accountImport", {
        roster: state.pairingImportInput.value.trim(),
        userGesture: true,
      });
      await deps.loadStatus();
      state.step.value = 4;
      state.setStatus("已加入账号，请完成首次同步", "success");
    } catch (err) {
      state.setStatus(
        `配对串无效或尚未被批准：${(err as Error).message}`,
        "error",
      );
    } finally {
      state.isBusy.value = false;
    }
  }

  async function handleGenerateInvite() {
    if (state.isBusy.value) return;
    state.isBusy.value = true;
    state.setStatus("生成邀请中…", "info");
    try {
      const result = await invoke("myz:pairingInvite", { userGesture: true });
      state.pairingInvite.value = result.offer;
      state.setStatus("邀请已生成，请发送给新设备", "success");
    } catch (err) {
      state.setStatus(`生成失败：${(err as Error).message}`, "error");
    } finally {
      state.isBusy.value = false;
    }
  }

  async function handleApprove() {
    if (state.isBusy.value) return;
    if (!state.pairingResponseInput.value.trim()) {
      state.setStatus("请粘贴响应串", "error");
      return;
    }
    state.isBusy.value = true;
    state.setStatus("批准中…", "info");
    try {
      const result = await invoke("myz:pairingApprove", {
        response: state.pairingResponseInput.value.trim(),
        userGesture: true,
      });
      state.pairingHostSas.value = result.sas;
      state.pairingRoster.value = result.roster;
      await deps.loadStatus();
      state.setStatus("设备已加入，请核对短码并把配对串发回新设备", "success");
    } catch (err) {
      state.setStatus(`批准失败：${(err as Error).message}`, "error");
    } finally {
      state.isBusy.value = false;
    }
  }

  return {
    copyText,
    handleAcceptInvite,
    handleImportAccount,
    handleGenerateInvite,
    handleApprove,
  };
}

export type PairingActions = ReturnType<typeof createPairingActions>;
