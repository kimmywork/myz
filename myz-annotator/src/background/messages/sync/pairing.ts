import {
  acceptPairingInvite,
  approvePairing,
  createPairingInvite,
} from "../../sync/v2/pairingSession";
import { registerMessageHandler } from "../handler";

/** Device pairing (invite → accept → approve) message handlers. */
export function registerPairingHandlers() {
  registerMessageHandler("myz:pairingInvite", async () =>
    createPairingInvite(),
  );

  registerMessageHandler(
    "myz:pairingAccept",
    async (payload: { invite: string }) => {
      if (!payload?.invite) throw new Error("Missing pairing invite");
      return acceptPairingInvite(payload.invite);
    },
  );

  registerMessageHandler(
    "myz:pairingApprove",
    async (payload: { response: string }) => {
      if (!payload?.response) throw new Error("Missing pairing response");
      return approvePairing(payload.response);
    },
  );
}
