/**
 * Message handlers for the capture cache ("staged assets"). Content scripts
 * and the stitch editor talk to this API; the actual bytes never leave the
 * extension origin because the background owns the store.
 */
import type { MessageContext } from "@myz/shared/messageRegistry";
import { generateId } from "../storage";
import { stagedAssetStore } from "../stores";
import { registerMessageHandler } from "./handler";
import {
  STAGED_ASSET_MAX_BYTES,
  estimateDataUrlBytes,
  isStagedAssetKind,
  normalizeStagedAsset,
  toStagedAssetMeta,
  type NewStagedAsset,
  type StagedAsset,
  type StagedAssetContext,
} from "@/stitch/staged-asset.js";

export interface StageAssetMessageResult {
  id: string;
}

/**
 * The capture's own context (selection text / video time), without filling in
 * anything the background knows better.
 */
function normalizeContextInput(raw: unknown): StagedAssetContext | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as StagedAssetContext;
  const context: StagedAssetContext = {};
  if (typeof value.text === "string" && value.text.trim()) {
    context.text = value.text.trim();
  }
  if (
    typeof value.timeSeconds === "number" &&
    Number.isFinite(value.timeSeconds) &&
    value.timeSeconds >= 0
  ) {
    context.timeSeconds = Math.floor(value.timeSeconds);
  }
  if (typeof value.pageUrl === "string" && value.pageUrl) {
    context.pageUrl = value.pageUrl;
  }
  if (typeof value.pageTitle === "string" && value.pageTitle) {
    context.pageTitle = value.pageTitle;
  }
  return Object.keys(context).length ? context : undefined;
}

/**
 * Adds the host page URL/title (§I7). The content script's sender URL is the
 * page, so this needs no change to any capture path; a message from an
 * extension page has no host page and leaves the fields alone.
 */
async function withPageContext(
  context: StagedAssetContext | undefined,
  ctx: MessageContext,
): Promise<StagedAssetContext | undefined> {
  const pageUrl = ctx.url && /^https?:/i.test(ctx.url) ? ctx.url : undefined;
  let pageTitle: string | undefined;
  if (pageUrl && typeof ctx.tabId === "number") {
    try {
      pageTitle = (await chrome.tabs.get(ctx.tabId))?.title || undefined;
    } catch {
      pageTitle = undefined;
    }
  }
  if (!pageUrl && !pageTitle) return context;
  return { ...context, pageUrl, pageTitle } as StagedAssetContext;
}

function positiveInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : 0;
}

export function initializeStagedAssetMessageHandlers() {
  registerMessageHandler(
    "myz:stageAsset",
    async (payload: Partial<NewStagedAsset> | undefined, ctx) => {
      if (!payload || typeof payload.dataUrl !== "string" || !payload.dataUrl) {
        throw new Error("Invalid staged asset payload");
      }
      if (estimateDataUrlBytes(payload.dataUrl) > STAGED_ASSET_MAX_BYTES) {
        throw new Error("Staged asset is too large");
      }
      const captured = normalizeContextInput(payload.context);
      const asset: StagedAsset = {
        id: generateId(),
        createdAt: new Date().toISOString(),
        name:
          typeof payload.name === "string" && payload.name
            ? payload.name
            : "未命名图片",
        mime:
          typeof payload.mime === "string" && payload.mime
            ? payload.mime
            : "image/png",
        width: positiveInt(payload.width),
        height: positiveInt(payload.height),
        dataUrl: payload.dataUrl,
        thumb:
          typeof payload.thumb === "string" && payload.thumb
            ? payload.thumb
            : payload.dataUrl,
        sourceUrl:
          typeof payload.sourceUrl === "string" && payload.sourceUrl
            ? payload.sourceUrl
            : undefined,
        sourceKind: isStagedAssetKind(payload.sourceKind)
          ? payload.sourceKind
          : "image",
        size: estimateDataUrlBytes(payload.dataUrl),
        context: await withPageContext(captured, ctx),
      };
      const normalized = normalizeStagedAsset(asset);
      if (!normalized) {
        throw new Error("Invalid staged asset payload");
      }
      await stagedAssetStore.save(normalized);
      return { id: normalized.id } satisfies StageAssetMessageResult;
    },
  );

  registerMessageHandler("myz:listStagedAssets", async () => {
    const assets = await stagedAssetStore.list();
    return assets.map(toStagedAssetMeta);
  });

  registerMessageHandler(
    "myz:getStagedAsset",
    async (payload: { id?: string } | undefined) => {
      if (!payload?.id) return null;
      const asset = await stagedAssetStore.get(payload.id);
      return asset ? normalizeStagedAsset(asset) : null;
    },
  );

  registerMessageHandler(
    "myz:deleteStagedAsset",
    async (payload: { id?: string } | undefined) => {
      if (!payload?.id) return { ok: false };
      await stagedAssetStore.remove(payload.id);
      return { ok: true };
    },
  );

  registerMessageHandler("myz:clearStagedAssets", async () => {
    await stagedAssetStore.clear();
    return { ok: true };
  });
}
