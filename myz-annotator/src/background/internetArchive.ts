import {
  generateId,
  readSettings,
  getArchiveEntry,
  getArchiveQueue,
  saveArchiveQueueEntry,
  saveArchiveEntry,
  addArchiveHistoryEntry,
  getArchiveHistoryForUrl,
  deleteArchiveQueueEntry,
  getArchiveHistory as getArchiveHistoryFromStorage,
} from "./storage.js";
import {
  canonicalUrl,
  buildArchiveSnapshotUrl,
  extractArchiveInfo,
} from "@/shared/url.js";

const CDX_ENDPOINT = "https://web.archive.org/cdx/search/cdx";
const SAVE_ENDPOINT = "https://web.archive.org/save";
const WAYBACK_BASE = "https://web.archive.org";

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
  url?: string;
  status: ArchiveStatusType;
  saved?: boolean;
  snapshot: ArchiveSnapshot | null;
  lastCheckedAt: string | null;
  lastAttemptAt: string | null;
  lastError?: string | null;
  queue?: {
    status: string;
    requestedAt: string | null;
    position: number | null;
  } | null;
}

export interface ArchiveQueueEntry {
  id: string;
  url: string;
  position?: number;
  requestedAt: string | null;
  status: string;
  attempts: number;
  force: boolean;
}

export interface ArchiveHistoryEntry {
  id: string;
  url: string;
  action: ArchiveActions;
  timestamp: string | null;
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
export enum ArchiveActions {
  "queue" = "queue",
  "queue:start" = "queue:start",
  "cdx-check" = "cdx-check",
  "save-request" = "save-request",
  "cdx-poll" = "cdx-poll",
  "queue:complete" = "queue:complete",
  "queue:pending" = "queue:pending",
  "queue:error" = "queue:error",
  "unknown" = "unknown",
}

const ARCHIVE_ACTION_LABELS: Record<ArchiveActions, string> = {
  queue: "加入队列",
  "queue:start": "开始处理",
  "cdx-check": "查询存档",
  "save-request": "提交保存请求",
  "cdx-poll": "轮询存档",
  "queue:complete": "保存完成",
  "queue:pending": "等待生成",
  "queue:error": "处理失败",
  unknown: "未知状态",
};

export function queueStatusTone(entry: ArchiveQueueEntry) {
  const status = (entry?.status || "queued").toLowerCase();
  if (status.includes("error") || status.includes("fail")) {
    return "error";
  }
  if (status.includes("complete") || status.includes("done")) {
    return "success";
  }
  if (status.includes("pending") || status.includes("processing")) {
    return "info";
  }
  return "info";
}

export function queueStatusLabel(entry: ArchiveQueueEntry) {
  const status = (entry?.status || "queued").toLowerCase();
  if (status.includes("error") || status.includes("fail")) {
    return "失败";
  }
  if (status.includes("complete") || status.includes("done")) {
    return "完成";
  }
  if (status.includes("pending")) {
    return "等待存档";
  }
  if (status.includes("processing")) {
    return "处理中";
  }
  return "排队中";
}

export function historyStatusTone(entry: ArchiveHistoryEntry) {
  if (!entry) {
    return "info";
  }
  if (entry.status === "error" || entry.success === false) {
    return "error";
  }
  if (entry.status === "success" || entry.success === true) {
    return "success";
  }
  return "info";
}

export function historyStatusLabel(entry: ArchiveHistoryEntry) {
  if (!entry) {
    return "记录";
  }
  if (entry.status === "success" || entry.success === true) {
    return "成功";
  }
  if (entry.status === "error" || entry.success === false) {
    return "失败";
  }
  return "记录";
}

export function describeArchiveAction(action: ArchiveActions) {
  if (!action) {
    return "未知操作";
  }
  return ARCHIVE_ACTION_LABELS[action] || action;
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
  const entry = (await getArchiveEntry(canonical)) || {};
  const queue = await getArchiveQueue();
  const queueEntry = findQueueEntry(queue, canonical);
  const position = computeQueuePosition(queue, canonical);
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

  const queue = await getArchiveQueue();
  const queueEntry = findQueueEntry(queue, canonical);

  if (queueEntry && !force) {
    const entry = (await getArchiveEntry(canonical)) || {};
    const position = computeQueuePosition(queue, canonical);
    return formatArchiveEntry(
      canonical,
      entry,
      "queued",
      queueEntry,
      position ?? undefined,
    );
  }

  const archiveEntry = normalizeArchiveEntry(
    (await getArchiveEntry(canonical))
  );

  if (!force) {
    const history = await getArchiveHistoryForUrl(canonical);
    const latestHistory = findLatestHistoryForUrl(history, canonical);
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

  await saveArchiveQueueEntry(newQueueEntry);
  await saveArchiveEntry(canonical, {
    ...archiveEntry,
    status: "pending",
    lastError: null,
  } as ArchiveEntry);

  await appendArchiveHistory({
    url: canonical,
    action: ArchiveActions.queue,
    status: "info",
    success: true,
    message: force ? "强制加入保存队列" : "加入保存队列",
  });

  scheduleArchiveQueueProcessing();

  const updatedQueue = await getArchiveQueue();
  const position = computeQueuePosition(updatedQueue, canonical);
  return formatArchiveEntry(
    canonical,
    archiveEntry,
    "queued",
    newQueueEntry,
    position ?? undefined,
  );
}

function normalizeArchiveEntry(entry: ArchiveEntry | null): Partial<ArchiveEntry> {
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

async function appendArchiveHistory(
  entry: Partial<ArchiveHistoryEntry>,
) {
  await addArchiveHistoryEntry({
    id: entry.id || generateId(),
    url: entry.url!,
    action: entry.action || ArchiveActions.unknown,
    timestamp: entry.timestamp || new Date().toISOString(),
    success: Boolean(entry.success),
    status: entry.status || (entry.success ? "success" : "info"),
    statusCode: typeof entry.statusCode === "number" ? entry.statusCode : null,
    message: entry.message || "",
  });
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
      const queue = await getArchiveQueue();
      if (!queue.length) {
        break;
      }
      const entry = queue[0];
      await handleQueueEntry(entry);
    }
  } finally {
    queueProcessing = false;
  }
}

async function handleQueueEntry(
  queueEntry: ArchiveQueueEntry,
) {
  const canonical = queueEntry.url;
  const nowIso = new Date().toISOString();
  const archiveEntry = normalizeArchiveEntry(
    (await getArchiveEntry(canonical)),
  );

  await appendArchiveHistory({
    url: canonical,
    action: ArchiveActions["queue:start"],
    status: "info",
    success: true,
    message: "开始处理保存请求",
  });

  const settings = await readSettings();

  try {
    const cdxResult = await fetchLatestSnapshot(canonical);
    await appendArchiveHistory({
      url: canonical,
      action: ArchiveActions["cdx-check"],
      status: cdxResult.snapshot ? "success" : "info",
      success: Boolean(cdxResult.snapshot),
      statusCode: cdxResult.statusCode,
      message: cdxResult.snapshot
        ? "已存在存档，跳过保存"
        : "未找到现有存档，准备保存",
    });

    if (cdxResult.snapshot) {
      await saveArchiveEntry(canonical, {
        ...archiveEntry,
        status: "saved",
        snapshot: buildSnapshot(cdxResult.snapshot),
        lastCheckedAt: nowIso,
        lastError: null,
      } as ArchiveEntry);
      await deleteArchiveQueueEntry(queueEntry.id);
      await appendArchiveHistory({
        url: canonical,
        action: ArchiveActions["queue:complete"],
        status: "success",
        success: true,
        message: "检测到已有存档，标记为已保存",
      });
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

    await appendArchiveHistory({
      url: canonical,
      action: ArchiveActions["save-request"],
      status: "info",
      success: true,
      message: "已向 Internet Archive 提交保存请求",
    });

    const confirmed = await pollForSnapshot(
      canonical,
      archiveEntry.snapshot?.timestamp,
      async (pollResult: CDXResult) => {
        await appendArchiveHistory({
          url: canonical,
          action: ArchiveActions["cdx-poll"],
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
      await saveArchiveEntry(canonical, {
        ...archiveEntry,
        status: "saved",
        snapshot: buildSnapshot(confirmed.snapshot),
        lastCheckedAt: new Date().toISOString(),
        lastAttemptAt: nowIso,
        lastError: null,
      } as ArchiveEntry);
      await appendArchiveHistory({
        url: canonical,
        action: ArchiveActions["queue:complete"],
        status: "success",
        success: true,
        message: "页面已成功保存到 Internet Archive",
      });
    } else {
      await saveArchiveEntry(canonical, {
        ...archiveEntry,
        status: "pending",
        lastAttemptAt: nowIso,
        lastError: null,
      } as ArchiveEntry);
      await appendArchiveHistory({
        url: canonical,
        action: ArchiveActions["queue:pending"],
        status: "info",
        success: true,
        message: "保存请求已提交，等待存档生成",
      });
    }

    await deleteArchiveQueueEntry(queueEntry.id);
  } catch (error) {
    await saveArchiveEntry(canonical, {
      ...archiveEntry,
      status: "failed",
      lastAttemptAt: nowIso,
      lastError: (error as Error)?.message || String(error),
    } as ArchiveEntry);
    await appendArchiveHistory({
      url: canonical,
      action: ArchiveActions["queue:error"],
      status: "error",
      success: false,
      message: (error as Error)?.message || "保存失败",
    });
    await deleteArchiveQueueEntry(queueEntry.id);
  }
}



export async function getArchiveHistory() {
  const history = await getArchiveHistoryFromStorage();
  const queue = await getArchiveQueue();
  return {
    queue,
    history: history.reverse(),
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
