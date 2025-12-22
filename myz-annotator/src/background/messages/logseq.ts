import { readSettings, readState, sortedHighlights, writeSettings, writeState } from "../storage";
import { registerMessageHandler } from "./handler";
import { MyZRecord } from "@/shared/types";
import { buildHighlightBlock, buildLogseqEndpointList, callLogseq, ensureLogseqPage, extractEntityUuid, extractInsertedBlockEntities, matchInsertedHighlights, normalizeLogseqEndpoint, normalizeLogseqPageName, RecordBlockEntry, } from "../logseq";
import { DEFAULT_LOGSEQ_PAGE } from "@/background/constants";


export function initializeLogseqMessageHandlers() {
  registerMessageHandler("myz:syncLogseq", async (payload: Partial<MyZRecord>) => {
    const settings = await readSettings();
    if (!settings.logseqSyncEnabled) {
      throw new Error("LogSeq 同步未启用");
    }
    const state = await readState();
    const highlights = sortedHighlights(state);
    const pageName = normalizeLogseqPageName(
      payload?.page || settings.logseqPage || DEFAULT_LOGSEQ_PAGE,
    );
    if (!highlights.length) {
      return {
        success: true,
        inserted: 0,
        message: "没有可同步的标注",
        page: pageName,
      };
    }
    const token = (payload?.token || settings.logseqAuthToken || "").trim();

    const endpoints = buildLogseqEndpointList(settings, payload);
    let lastError = null;
    for (const endpoint of endpoints) {
      if (!endpoint) {
        continue;
      }
      try {
        const pageInfo = await ensureLogseqPage({ endpoint, token, pageName });
        const pageUuid = pageInfo?.uuid;
        if (!pageUuid) {
          throw new Error("无法确定 LogSeq 页面 UUID");
        }

        const exportedAt = new Date();
        const recordsToInsertMap = new Map<string, MyZRecord>();
        const recordsWithKnownUuid: MyZRecord[] = [];

        highlights.forEach((record) => {
          if (!record) {
            return;
          }
          if (record.logseqBlockUuid) {
            recordsWithKnownUuid.push(record);
          } else {
            recordsToInsertMap.set(record.id, record);
          }
        });

        for (const record of recordsWithKnownUuid) {
          const uuid = record.logseqBlockUuid;
          if (!uuid) {
            recordsToInsertMap.set(record.id, record);
            continue;
          }
          const existingBlock = await callLogseq({
            endpoint,
            token,
            method: "logseq.Editor.getBlock",
            args: [uuid],
          });
          if (!existingBlock) {
            recordsToInsertMap.set(record.id, record);
          }
        }

        const recordsToInsert = Array.from(recordsToInsertMap.values());
        const payloadEntries: RecordBlockEntry[] = recordsToInsert
          .map((record) => ({
            record,
            block: buildHighlightBlock(record),
          }))
          .filter((entry) => !!entry.block);

        let inserted = 0;
        let stateMutated = false;

        if (payloadEntries.length) {
          const blocksPayload = payloadEntries.map((entry) => entry.block);
          const result = await callLogseq({
            endpoint,
            token,
            method: "logseq.Editor.insertBatchBlock",
            args: [pageUuid, blocksPayload, { sibling: false, before: false }],
          });

          const createdBlocks = extractInsertedBlockEntities(result);
          const blockMatches = await matchInsertedHighlights({
            entries: payloadEntries,
            candidates: createdBlocks,
            pageName,
            endpoint,
            token,
          });

          const syncedAt = exportedAt.toISOString();
          blockMatches.forEach((entity, entry) => {
            const blockUuid = extractEntityUuid(entity);
            if (!blockUuid) {
              throw new Error("未能获取新建块的 UUID");
            }
            const current = state.highlights[entry.record.id] || entry.record;
            state.highlights[entry.record.id] = {
              ...current,
              logseqBlockUuid: blockUuid,
              logseqSyncedAt: syncedAt,
            };
            inserted += 1;
            stateMutated = true;
          });
        }

        if (stateMutated) {
          await writeState(state);
        }

        if (
          !settings.logseqEndpoint ||
          normalizeLogseqEndpoint(settings.logseqEndpoint) !== endpoint
        ) {
          await writeSettings({ logseqEndpoint: endpoint });
        }

        return {
          success: true,
          endpoint,
          page: pageName,
          pageUuid,
          inserted,
          total: highlights.length,
          skipped: highlights.length - inserted,
        };
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) {
      throw lastError;
    }
    throw new Error("LogSeq sync failed: no endpoint responded");
  });
}