/**
 * Content-side handlers for media capture. The background context menu forwards
 * the clicked element's URL here; the heavy lifting (fetch/draw/crop + staging)
 * lives in `../capture-media`.
 */
import { capturePageImage, captureVideoFrame } from "../capture-media";
import { registerMessageHandler } from "./handler";

export function initializeCaptureMediaMessageHandlers() {
  registerMessageHandler(
    "myz:capturePageImage",
    async (payload: { srcUrl?: string } | undefined) => {
      await capturePageImage(payload?.srcUrl);
      return { ok: true };
    },
  );

  registerMessageHandler(
    "myz:captureVideoFrame",
    async (payload: { srcUrl?: string } | undefined) => {
      await captureVideoFrame(payload?.srcUrl);
      return { ok: true };
    },
  );
}
