import {
  canonicalUrl,
  buildArchiveSnapshotUrl,
  extractArchiveInfo,
} from "../shared/url.js";
import { generateId, readSettings, readState, writeState } from "./storage.js";

const CDX_ENDPOINT = "https://web.archive.org/cdx/search/cdx";
const SAVE_ENDPOINT = "https://web.archive.org/save";
const WAYBACK_BASE = "https://web.archive.org";
const MAX_HISTORY_ITEMS = 200;

let queueProcessing = false;
let queueScheduled = false;

type ArchiveStatusType =
  | "unknown"
  | "pending"
  | "queued"
  | "saved"
  | "exists"
  | "already-saved"
  | "failed";

type ArchiveSnapshot = { timestamp: string; url: string };

export interface ArchiveEntry {
  url: string;
  status: ArchiveStatusType;
  saved: boolean;
  snapshot: ArchiveSnapshot | null;
  lastCheckedAt: string | null;
  lastAttemptAt: string | null;
  lastError?: string | null;
  queue: {
    status: string;
    requestedAt: string | null;
    position: number | null;
  } | null;
}

export interface ArchiveState {
  archives: Record<string, ArchiveEntry>;
  archiveQueue: ArchiveQueueEntry[];
  archiveHistory: ArchiveHistoryEntry[];
}

export interface ArchiveQueueEntry {
  id: string;
  url: string;
  requestedAt: string;
  status: string;
  attempts: number;
  force: boolean;
}

export interface ArchiveHistoryEntry {
  id: string;
  url: string;
  action: string;
  timestamp: string;
  success: boolean;
  status: string;
  statusCode: number | null;
  message: string;
}

interface ArchiveRequest {
  url: string;
  force: boolean;
}

interface CDXSnapshot {
  timestamp: string;
  originalUrl: string;
}

interface CDXResult {
  snapshot: CDXSnapshot | null;
  statusCode: number | null;
}

interface SaveSubmissionResult {
  url: string;
  accessKey: string;
  accessSecret: string;
}

export async function getArchiveStatusForUrl(
  url: string,
): Promise<ArchiveEntry> {
  const canonical = canonicalUrl(url);
  if (!canonical) {
    return {
      url: "",
      status: "unknown",
      saved: false,
      snapshot: null,
      lastCheckedAt: null,
      lastAttemptAt: null,
      queue: null,
    };
  }
  const state: ArchiveState = await readState();
  ensureArchiveContainers(state);
  const entry = normalizeArchiveEntry(state.archives[canonical]);
  const queueEntry = findQueueEntry(state.archiveQueue, canonical);
  const position = computeQueuePosition(state.archiveQueue, canonical);
  return formatArchiveEntry(
    canonical,
    entry,
    undefined,
    queueEntry ?? undefined,
    position ?? undefined,
  );
}

export async function ensureArchiveSnapshot({
  url,
  force = false,
}: Partial<ArchiveRequest> = {}) {
  const canonical = canonicalUrl(url);
  if (!canonical) {
    throw new Error("无法识别页面地址");
  }

  const state: ArchiveState = await readState();
  ensureArchiveContainers(state);

  const queueEntry = findQueueEntry(state.archiveQueue, canonical);
  if (queueEntry && !force) {
    const entry = normalizeArchiveEntry(state.archives[canonical]);
    const position = computeQueuePosition(state.archiveQueue, canonical);
    return formatArchiveEntry(
      canonical,
      entry,
      "queued",
      queueEntry,
      position ?? undefined,
    );
  }

  const archiveEntry = normalizeArchiveEntry(state.archives[canonical]);
  if (!force) {
    const latestHistory = findLatestHistoryForUrl(
      state.archiveHistory,
      canonical,
    );
    if (latestHistory) {
      return formatArchiveEntry(canonical, archiveEntry, archiveEntry.status);
    }
    if (archiveEntry.status === "saved" && archiveEntry.snapshot?.timestamp) {
      return formatArchiveEntry(canonical, archiveEntry, "already-saved");
    }
  }

  const newQueueEntry = {
    id: generateId(),
    url: canonical,
    requestedAt: new Date().toISOString(),
    status: "queued",
    attempts: 0,
    force: Boolean(force),
  };

  state.archiveQueue.push(newQueueEntry);
  state.archives[canonical] = {
    ...archiveEntry,
    status: "pending",
    lastError: null,
  } as ArchiveEntry;

  appendArchiveHistory(state, {
    url: canonical,
    action: "queue",
    status: "info",
    success: true,
    message: force ? "强制加入保存队列" : "加入保存队列",
  });

  await writeState(state);
  scheduleArchiveQueueProcessing();

  const position = computeQueuePosition(state.archiveQueue, canonical);
  return formatArchiveEntry(
    canonical,
    state.archives[canonical],
    "queued",
    newQueueEntry,
    position ?? undefined,
  );
}

function normalizeArchiveEntry(entry: ArchiveEntry): Partial<ArchiveEntry> {
  if (!entry || typeof entry !== "object") {
    return {
      status: "unknown",
      snapshot: null,
      lastCheckedAt: null,
      lastAttemptAt: null,
      lastError: null,
    };
  }
  const normalized = {
    status: typeof entry.status === "string" ? entry.status : "unknown",
    snapshot: normalizeSnapshot(entry.snapshot),
    lastCheckedAt:
      typeof entry.lastCheckedAt === "string" ? entry.lastCheckedAt : null,
    lastAttemptAt:
      typeof entry.lastAttemptAt === "string" ? entry.lastAttemptAt : null,
    lastError: typeof entry.lastError === "string" ? entry.lastError : null,
  };
  return normalized;
}

function normalizeSnapshot(
  snapshot: ArchiveEntry["snapshot"],
): ArchiveEntry["snapshot"] {
  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }
  const timestamp =
    typeof snapshot.timestamp === "string" ? snapshot.timestamp : null;
  const url = typeof snapshot.url === "string" ? snapshot.url : null;
  if (!timestamp || !url) {
    return null;
  }
  return { timestamp, url };
}

function formatArchiveEntry(
  canonical: string,
  entry: Partial<ArchiveEntry>,
  statusOverride?: ArchiveStatusType,
  queueEntry?: ArchiveQueueEntry,
  queuePosition?: number,
): ArchiveEntry {
  const status = statusOverride || entry.status || "unknown";
  const queue = queueEntry
    ? {
        status: queueEntry!.status,
        requestedAt: queueEntry!.requestedAt,
        position: queuePosition ?? null,
      }
    : null;
  return {
    url: canonical,
    status,
    saved:
      status === "saved" || status === "exists" || status === "already-saved",
    snapshot: entry.snapshot ?? null,
    lastCheckedAt: entry.lastCheckedAt ?? null,
    lastAttemptAt: entry.lastAttemptAt ?? null,
    lastError: entry.lastError,
    queue,
  };
}

function ensureArchiveContainers(state: ArchiveState): ArchiveState {
  if (!state.archives || typeof state.archives !== "object") {
    state.archives = {};
  }
  if (!Array.isArray(state.archiveQueue)) {
    state.archiveQueue = [];
  }
  if (!Array.isArray(state.archiveHistory)) {
    state.archiveHistory = [];
  }
  return state;
}

function findQueueEntry(
  queue: ArchiveQueueEntry[],
  url: string,
): ArchiveQueueEntry | null {
  return Array.isArray(queue)
    ? queue.find((entry) => entry?.url === url) || null
    : null;
}

function computeQueuePosition(
  queue: ArchiveQueueEntry[],
  url: string,
): number | null {
  if (!Array.isArray(queue)) {
    return null;
  }
  const index = queue.findIndex((entry) => entry?.url === url);
  return index === -1 ? null : index;
}

function findLatestHistoryForUrl(
  history: ArchiveHistoryEntry[],
  url: string,
): ArchiveHistoryEntry | null {
  if (!Array.isArray(history) || !history.length) {
    return null;
  }
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (entry?.url === url) {
      return entry;
    }
  }
  return null;
}

function appendArchiveHistory(
  state: ArchiveState,
  entry: Partial<ArchiveHistoryEntry>,
) {
  if (!state.archiveHistory) {
    state.archiveHistory = [];
  }
  state.archiveHistory.push({
    id: entry.id || generateId(),
    url: entry.url!,
    action: entry.action || "unknown",
    timestamp: entry.timestamp || new Date().toISOString(),
    success: Boolean(entry.success),
    status: entry.status || (entry.success ? "success" : "info"),
    statusCode: typeof entry.statusCode === "number" ? entry.statusCode : null,
    message: entry.message || "",
  });
  if (state.archiveHistory.length > MAX_HISTORY_ITEMS) {
    state.archiveHistory = state.archiveHistory.slice(-MAX_HISTORY_ITEMS);
  }
}

function scheduleArchiveQueueProcessing() {
  if (queueProcessing || queueScheduled) {
    return;
  }
  queueScheduled = true;
  setTimeout(() => {
    queueScheduled = false;
    processArchiveQueue().catch((error) => {
      console.error("Internet Archive queue processing failed", error);
    });
  }, 0);
}

async function processArchiveQueue() {
  if (queueProcessing) {
    return;
  }
  queueProcessing = true;
  try {
    while (true) {
      const state = await readState();
      ensureArchiveContainers(state);
      if (!state.archiveQueue.length) {
        break;
      }
      const entry = state.archiveQueue[0];
      await handleQueueEntry(state, entry);
    }
  } finally {
    queueProcessing = false;
  }
}

async function handleQueueEntry(
  state: ArchiveState,
  queueEntry: ArchiveQueueEntry,
) {
  ensureArchiveContainers(state);
  const canonical = queueEntry.url;
  const archives = state.archives;
  const nowIso = new Date().toISOString();
  const archiveEntry = normalizeArchiveEntry(archives[canonical]);

  appendArchiveHistory(state, {
    url: canonical,
    action: "queue:start",
    status: "info",
    success: true,
    message: "开始处理保存请求",
  });

  const settings = await readSettings();

  try {
    const cdxResult = await fetchLatestSnapshot(canonical);
    appendArchiveHistory(state, {
      url: canonical,
      action: "cdx-check",
      status: cdxResult.snapshot ? "success" : "info",
      success: Boolean(cdxResult.snapshot),
      statusCode: cdxResult.statusCode,
      message: cdxResult.snapshot
        ? "已存在存档，跳过保存"
        : "未找到现有存档，准备保存",
    });

    if (cdxResult.snapshot) {
      archives[canonical] = {
        ...archiveEntry,
        status: "saved",
        snapshot: buildSnapshot(cdxResult.snapshot),
        lastCheckedAt: nowIso,
        lastError: null,
      } as ArchiveEntry;
      removeQueueEntry(state, queueEntry.id);
      appendArchiveHistory(state, {
        url: canonical,
        action: "queue:complete",
        status: "success",
        success: true,
        message: "检测到已有存档，标记为已保存",
      });
      await writeState(state);
      return;
    }

    if (!settings.internetArchiveEnabled) {
      throw new Error("Internet Archive 保存未启用");
    }

    const trimmedKey = (settings.internetArchiveAccessKey || "").trim();
    const trimmedSecret = (settings.internetArchiveAccessSecret || "").trim();

    await submitSaveRequest({
      url: canonical,
      accessKey: trimmedKey,
      accessSecret: trimmedSecret,
    });

    appendArchiveHistory(state, {
      url: canonical,
      action: "save-request",
      status: "info",
      success: true,
      message: "已向 Internet Archive 提交保存请求",
    });

    const confirmed = await pollForSnapshot(
      canonical,
      archiveEntry.snapshot?.timestamp,
      (pollResult: CDXResult) => {
        appendArchiveHistory(state, {
          url: canonical,
          action: "cdx-poll",
          status: pollResult.snapshot ? "success" : "info",
          success: Boolean(pollResult.snapshot),
          statusCode: pollResult.statusCode,
          message: pollResult.snapshot
            ? "轮询到新的存档"
            : "暂未生成存档，继续等待",
        });
      },
    );

    if (confirmed?.snapshot) {
      archives[canonical] = {
        ...archiveEntry,
        status: "saved",
        snapshot: buildSnapshot(confirmed.snapshot),
        lastCheckedAt: new Date().toISOString(),
        lastAttemptAt: nowIso,
        lastError: null,
      } as ArchiveEntry;
      appendArchiveHistory(state, {
        url: canonical,
        action: "queue:complete",
        status: "success",
        success: true,
        message: "页面已成功保存到 Internet Archive",
      });
    } else {
      archives[canonical] = {
        ...archiveEntry,
        status: "pending",
        lastAttemptAt: nowIso,
        lastError: null,
      } as ArchiveEntry;
      appendArchiveHistory(state, {
        url: canonical,
        action: "queue:pending",
        status: "info",
        success: true,
        message: "保存请求已提交，等待存档生成",
      });
    }

    removeQueueEntry(state, queueEntry.id);
    await writeState(state);
  } catch (error) {
    archives[canonical] = {
      ...archiveEntry,
      status: "failed",
      lastAttemptAt: nowIso,
      lastError: (error as Error)?.message || String(error),
    } as ArchiveEntry;
    appendArchiveHistory(state, {
      url: canonical,
      action: "queue:error",
      status: "error",
      success: false,
      message: (error as Error)?.message || "保存失败",
    });
    removeQueueEntry(state, queueEntry.id);
    await writeState(state);
  }
}

function removeQueueEntry(state: ArchiveState, id: string) {
  if (!Array.isArray(state.archiveQueue)) {
    state.archiveQueue = [];
    return;
  }
  state.archiveQueue = state.archiveQueue.filter((item) => item.id !== id);
}

export async function getArchiveHistory() {
  const state = await readState();
  ensureArchiveContainers(state);
  return {
    queue: state.archiveQueue,
    history: state.archiveHistory,
  };
}

export function initializeArchiveQueue() {
  scheduleArchiveQueueProcessing();
}

async function fetchLatestSnapshot(url: string): Promise<CDXResult> {
  const endpoint = new URL(CDX_ENDPOINT);
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("output", "json");
  endpoint.searchParams.set("limit", "-1");
  endpoint.searchParams.set("fastLatest", "true");
  endpoint.searchParams.set("filter", "statuscode:200");

  const response = await fetch(endpoint.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    if (response.status === 404) {
      return { snapshot: null, statusCode: response.status };
    }
    throw new Error(`CDX 查询失败（${response.status}）`);
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    console.warn("CDX 响应解析失败", error);
    return { snapshot: null, statusCode: response.status };
  }

  if (!Array.isArray(data) || data.length < 2) {
    return { snapshot: null, statusCode: response.status };
  }

  const header = data[0];
  const row = data[1];
  if (!Array.isArray(header) || !Array.isArray(row)) {
    return { snapshot: null, statusCode: response.status };
  }

  const idxTimestamp = header.indexOf("timestamp");
  const idxOriginal = header.indexOf("original");
  const timestamp = idxTimestamp !== -1 ? row[idxTimestamp] : row[1];
  const original = idxOriginal !== -1 ? row[idxOriginal] : row[2];

  if (!timestamp) {
    return { snapshot: null, statusCode: response.status };
  }

  return {
    snapshot: {
      timestamp,
      originalUrl: original || url,
    },
    statusCode: response.status,
  };
}

async function submitSaveRequest({
  url,
  accessKey,
  accessSecret,
}: SaveSubmissionResult) {
  const params = new URLSearchParams();
  params.set("url", url);
  params.set("capture_all", "on");

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    Accept: "application/json, text/plain, */*",
  };

  if (accessKey && accessSecret) {
    headers.Authorization = `LOW ${accessKey}:${accessSecret}`;
  }

  const response = await fetch(SAVE_ENDPOINT, {
    method: "POST",
    headers,
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`保存请求失败（${response.status}）`);
  }

  const location =
    response.headers.get("content-location") ||
    response.headers.get("location");
  let snapshot = null;
  if (location) {
    snapshot = parseSnapshotLocation(location);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("json")) {
    try {
      await response.json();
    } catch (error) {
      console.warn("保存响应 JSON 解析失败", error);
    }
  } else {
    try {
      await response.text();
    } catch (error) {
      console.warn("保存响应文本读取失败", error);
    }
  }

  return { snapshot, statusCode: response.status };
}

async function pollForSnapshot(
  url: string,
  previousTimestamp: string | undefined,
  onPoll: (result: CDXResult) => void,
) {
  const maxAttempts = 3;
  let attempt = 0;
  let latest = null;
  while (attempt < maxAttempts) {
    let result;
    try {
      result = await fetchLatestSnapshot(url);
    } catch (error) {
      result = { snapshot: null, statusCode: null };
    }
    latest = result;
    if (typeof onPoll === "function") {
      onPoll(result);
    }
    if (
      result?.snapshot?.timestamp &&
      result.snapshot.timestamp !== previousTimestamp
    ) {
      return result;
    }
    attempt += 1;
    await delay(800 * attempt);
  }
  return latest;
}

function parseSnapshotLocation(location: string) {
  const absolute = location.startsWith("http")
    ? location
    : `${WAYBACK_BASE}${location}`;
  const info = extractArchiveInfo(absolute);
  if (!info?.timestamp || !info.originalUrl) {
    return null;
  }
  return {
    timestamp: info.timestamp,
    originalUrl: info.originalUrl,
    url: buildArchiveSnapshotUrl(info.timestamp, info.originalUrl),
  };
}

function buildSnapshot(snapshot: CDXSnapshot) {
  if (!snapshot?.timestamp || !snapshot.originalUrl) {
    return null;
  }
  return {
    timestamp: snapshot.timestamp,
    url: buildArchiveSnapshotUrl(snapshot.timestamp, snapshot.originalUrl),
  };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
