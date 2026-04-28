import { readSettings } from "../../storage.js";
import { SkillSelectionAgent } from "../agents/skillSelectionAgent.js";
import { ToolSelectionAgent } from "../agents/toolSelectionAgent.js";
import { injectSystemPromptAsUserMessage } from "../prompt/systemPrompt.js";
import { resolveAgentTarget } from "../runtime/agentSelection.js";
import { createProviderSession } from "../runtime/providerSession.js";
import { getSkillFile, listSkillFiles, listSkills } from "../skills/storage.js";
import type {
  ProviderChatCompletionRequest,
  ProviderMessage,
  ProviderToolCall,
} from "../providers/types.js";
import {
  completeAllTasks,
  getTaskPlan,
  initTaskPlan,
  listUnblockedTasks,
  updateTaskPlanStatus,
  updateTaskItem,
  updateTaskStatus,
} from "../tasks/taskManager.js";
import type {
  TaskItem,
  TaskPlanStatus,
  TaskPriority,
  TaskStatus,
} from "../tasks/taskManager.js";
import { listFiles, readFile, writeFile } from "../vfs.js";
import type { VirtualFileRecord } from "../vfs.js";
import { executeSandboxedCode } from "./codeExecution.js";
import { LOCAL_TOOL_DEFINITIONS } from "./localDefinitions.js";
import type { ToolExecutionResult } from "../types.js";
import { isRecord } from "@myz/shared/typeUtils";

function normalizeLimit(value: unknown, fallback = 20, max = 50): number {
  if (typeof value !== "number") return fallback;
  return Math.max(1, Math.min(max, Math.floor(value)));
}

function normalizeSearchEngine(value: unknown): "bing" | "google" {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  return raw === "google" ? "google" : "bing";
}

function normalizeSearchQuery(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTaskAction(value: unknown) {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!raw) return "";
  const normalized = raw.replace(/[\s-]+/g, "_");
  const aliases: Record<string, string> = {
    completeall: "complete_all",
    complete_all: "complete_all",
    list_tasks: "list",
    get_tasks: "get",
    update_task: "update",
    attach_task: "attach",
    init_plan: "init",
  };
  const mapped = aliases[normalized] || normalized;
  const allowed = new Set([
    "init",
    "update",
    "get",
    "list",
    "complete_all",
  ]);
  return allowed.has(mapped) ? mapped : "";
}

function normalizeCompatText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseTaskPlanStatus(value: unknown): TaskPlanStatus | undefined {
  switch (value) {
    case "planning":
    case "executing":
    case "blocked":
    case "done":
      return value;
    default:
      return undefined;
  }
}

function parseTaskStatus(value: unknown): TaskStatus | undefined {
  switch (value) {
    case "pending":
    case "in_progress":
    case "done":
    case "blocked":
      return value;
    default:
      return undefined;
  }
}

function parseTaskPriority(value: unknown): TaskPriority | undefined {
  return value === "high" || value === "low" || value === "medium"
    ? value
    : undefined;
}

function parseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const cleaned = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return cleaned.length ? cleaned : [];
}

function buildTaskItemPatch(
  raw: Record<string, unknown>,
): Partial<TaskItem> & { appendNote?: string } {
  const patch: Partial<TaskItem> & { appendNote?: string } = {};
  if (typeof raw.title === "string") {
    patch.title = raw.title.trim();
  }
  const status = parseTaskStatus(raw.status);
  if (status) {
    patch.status = status;
  }
  const priority = parseTaskPriority(raw.priority);
  if (priority) {
    patch.priority = priority;
  }
  const skills = parseStringArray(raw.skills);
  if (skills) {
    patch.skills = skills;
  }
  const blockedBy = parseStringArray(raw.blockedBy);
  if (blockedBy) {
    patch.blockedBy = blockedBy;
  }
  const blocks = parseStringArray(raw.blocks);
  if (blocks) {
    patch.blocks = blocks;
  }
  if (typeof raw.summary === "string") {
    patch.summary = raw.summary.trim();
  }
  if (typeof raw.outcome === "string") {
    patch.outcome = raw.outcome.trim();
  }
  const notes = parseStringArray(raw.notes);
  if (notes) {
    patch.notes = notes;
  }
  if (typeof raw.note === "string") {
    patch.appendNote = raw.note.trim();
  }
  return patch;
}

function resolveCompatTaskPayload(payload: unknown) {
  const source = isRecord(payload) ? payload : {};
  const subagentType = normalizeCompatText(
    source.subagent_type ||
      source.subagentType ||
      source.agent ||
      source.agent_type ||
      source.role,
  );
  const prompt = normalizeCompatText(
    source.prompt || source.task || source.instructions || source.input,
  );
  const description = normalizeCompatText(
    source.description || source.title || source.summary,
  );
  const taskId = normalizeCompatText(source.task_id || source.taskId);
  const command = normalizeCompatText(source.command);
  const model =
    isRecord(source.model) ? source.model : null;
  const managementSignals = [
    source.taskId,
    source.status,
    source.patch,
    source.currentTaskId,
    source.originalUserRequest,
    source.goal,
    source.tasks,
    source.assumptions,
    source.summary,
    source.outcome,
    source.note,
  ];
  const hasManagementSignals = managementSignals.some(
    (item) => typeof item !== "undefined",
  );
  const shouldDelegate =
    Boolean(subagentType || prompt || command) ||
    (Boolean(description) && !hasManagementSignals);

  if (!shouldDelegate) return null;

  return {
    subagentType,
    prompt: prompt || description,
    description,
    taskId,
    command,
    model,
  };
}

function buildSearchUrl(engine: "bing" | "google", query: string) {
  const encoded = encodeURIComponent(query);
  if (engine === "google") {
    return `https://www.google.com/search?q=${encoded}&hl=zh-CN`;
  }
  return `https://www.bing.com/search?q=${encoded}&setlang=zh-hans`;
}

function normalizeHttpUrl(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
  }
}

function normalizeSkillName(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePath(input: unknown): string {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return "";
  const cleaned = raw.replace(/\\/g, "/");
  const parts = cleaned.split("/").filter(Boolean);
  const stack: string[] = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return stack.join("/");
}

function parseSkillsPath(input: unknown): {
  kind: "root" | "skill";
  skillName?: string;
  filePath?: string;
} | null {
  const normalized = normalizePath(input);
  if (!normalized) return null;
  if (!normalized.startsWith("skills")) return null;
  const rest = normalized.slice("skills".length).replace(/^\/+/, "");
  if (!rest) {
    return { kind: "root" };
  }
  const parts = rest.split("/").filter(Boolean);
  if (!parts.length) {
    return { kind: "root" };
  }
  const skillName = parts[0];
  const filePath = parts.slice(1).join("/");
  return { kind: "skill", skillName, filePath };
}

async function resolveEnabledSkill(input: unknown) {
  const name = normalizeSkillName(input);
  if (!name) return null;
  const skills = await listSkills();
  const enabled = skills.filter((skill) => skill.enabled);
  const match =
    enabled.find((skill) => skill.id === name) ||
    enabled.find((skill) => skill.name === name);
  return match || null;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function resolveActiveTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return typeof tabs?.[0]?.id === "number" ? tabs[0].id : null;
}

async function resolveTabId(input?: unknown) {
  const tabId = typeof input === "number" ? input : null;
  if (typeof tabId === "number") return tabId;
  return resolveActiveTabId();
}

function isExpectedSearchUrl(engine: "bing" | "google", url: string) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.host.toLowerCase();
    const path = parsed.pathname || "";
    if (engine === "bing") {
      return host.endsWith("bing.com") && path.startsWith("/search");
    }
    return host.endsWith("google.com") && path.startsWith("/search");
  } catch {
    return false;
  }
}

async function waitForSearchTabReady(options: {
  tabId: number;
  engine: "bing" | "google";
  timeoutMs?: number;
}) {
  const { tabId, engine, timeoutMs = 20000 } = options;
  if (!tabId) throw new Error("tabId is required");

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    const url = typeof tab?.url === "string" ? tab.url : "";
    const status = tab?.status || "";
    if (status === "complete" && isExpectedSearchUrl(engine, url)) {
      return;
    }
    await delay(200);
  }
  throw new Error("Search page load timeout");
}

function isNoReceiverError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : isRecord(error) && typeof error.message === "string"
          ? error.message
          : "";
  return (
    message.includes("Receiving end does not exist") ||
    message.includes("Could not establish connection")
  );
}

async function requestSearchResultsFromTab(options: {
  tabId: number;
  engine: "bing" | "google";
  limit: number;
}) {
  const { tabId, engine, limit } = options;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      return await chrome.tabs.sendMessage(tabId, {
        type: "myz:extractSearchResults",
        payload: { engine, limit },
      });
    } catch (error) {
      lastError = error;
      if (!isNoReceiverError(error)) {
        throw error;
      }
      await delay(200 + attempt * 80);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to extract search results");
}

async function waitForHttpTabReady(options: {
  tabId: number;
  timeoutMs?: number;
}) {
  const { tabId, timeoutMs = 20000 } = options;
  if (!tabId) throw new Error("tabId is required");

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    const url = typeof tab?.url === "string" ? tab.url : "";
    const pendingUrl =
      typeof tab?.pendingUrl === "string" ? tab.pendingUrl : "";
    const resolvedUrl = url || pendingUrl;
    if (resolvedUrl.startsWith("http")) {
      return;
    }
    await delay(200);
  }
  throw new Error("Page navigation timeout");
}

async function requestPrimaryContentFromTab(options: {
  tabId: number;
  maxChars: number;
}) {
  const { tabId, maxChars } = options;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 18; attempt += 1) {
    try {
      return await chrome.tabs.sendMessage(tabId, {
        type: "myz:extractPrimaryContent",
        payload: { maxChars },
      });
    } catch (error) {
      lastError = error;
      if (!isNoReceiverError(error)) {
        throw error;
      }
      await delay(220 + attempt * 90);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to extract page content");
}

function truncateText(value: unknown, maxLen = 280) {
  const text =
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!text) return "";
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

function formatToolData(value: unknown, maxChars = 4000) {
  if (value == null) return "";
  let text = "";
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n...(truncated, ${text.length} chars total)`;
}

function appendToolData(baseText: string, data: unknown, maxChars = 4000) {
  const dataText = formatToolData(data, maxChars);
  if (!dataText) return baseText;
  return [baseText, "<tool_data>", dataText, "</tool_data>"]
    .filter(Boolean)
    .join("\n");
}

function normalizeJpegQuality(value: unknown, fallback = 0.7) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const raw = value > 1 ? value / 100 : value;
  return Math.max(0.1, Math.min(0.95, raw));
}

function bufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function downscaleDataUrl(options: {
  dataUrl: string;
  scale?: number;
  format?: "image/jpeg" | "image/png";
  quality?: number;
  viewportWidth?: number | null;
  viewportHeight?: number | null;
}): Promise<{
  dataUrl: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  format: "jpeg" | "png";
}> {
  const { dataUrl } = options;
  if (!dataUrl.startsWith("data:")) {
    return {
      dataUrl,
      width: 0,
      height: 0,
      originalWidth: 0,
      originalHeight: 0,
      format: options.format === "image/png" ? "png" : "jpeg",
    };
  }

  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const originalWidth = bitmap.width;
  const originalHeight = bitmap.height;
  const dprWidth =
    typeof options.viewportWidth === "number" && options.viewportWidth > 0
      ? originalWidth / options.viewportWidth
      : 1;
  const dprHeight =
    typeof options.viewportHeight === "number" && options.viewportHeight > 0
      ? originalHeight / options.viewportHeight
      : 1;
  const dpr = Math.max(dprWidth, dprHeight, 1);
  const scale =
    typeof options.scale === "number" ? options.scale : dpr >= 1.5 ? 0.25 : 0.4;
  const width = Math.max(1, Math.round(originalWidth * scale));
  const height = Math.max(1, Math.round(originalHeight * scale));

  if (typeof OffscreenCanvas === "undefined") {
    bitmap.close?.();
    return {
      dataUrl,
      width: originalWidth,
      height: originalHeight,
      originalWidth,
      originalHeight,
      format: options.format === "image/png" ? "png" : "jpeg",
    };
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    return {
      dataUrl,
      width: originalWidth,
      height: originalHeight,
      originalWidth,
      originalHeight,
      format: options.format === "image/png" ? "png" : "jpeg",
    };
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const format = options.format === "image/png" ? "image/png" : "image/jpeg";
  const blobOut = await canvas.convertToBlob(
    format === "image/jpeg"
      ? { type: format, quality: normalizeJpegQuality(options.quality) }
      : { type: format },
  );
  const base64 = bufferToBase64(await blobOut.arrayBuffer());
  return {
    dataUrl: `data:${blobOut.type};base64,${base64}`,
    width,
    height,
    originalWidth,
    originalHeight,
    format: format === "image/png" ? "png" : "jpeg",
  };
}

const LOCAL_TOOL_HANDLERS: Record<
  string,
  (args?: Record<string, unknown>) => Promise<ToolExecutionResult>
> = {
  WebSearch: async (args: Record<string, unknown> = {}) => {
    const query = normalizeSearchQuery(args.query);
    const engine = normalizeSearchEngine(args.engine);
    const limit = normalizeLimit(args.limit, 5, 10);

    if (!query) {
      return {
        content: [{ type: "text", text: "请输入要搜索的关键词。" }],
        data: [],
      };
    }

    const url = buildSearchUrl(engine, query);
    let tabId: number | null = null;
    try {
      const tab = await chrome.tabs.create({ url, active: false });
      tabId = typeof tab?.id === "number" ? tab.id : null;
      if (!tabId) {
        throw new Error("Failed to open search tab");
      }

      await waitForSearchTabReady({ tabId, engine, timeoutMs: 25000 });

      const resp = await requestSearchResultsFromTab({ tabId, engine, limit });
      const payload = isRecord(resp)
        ? (isRecord(resp.data) ? resp.data : resp)
        : {};
      const results =
        isRecord(payload) && Array.isArray(payload.results)
          ? payload.results
          : [];

      const lines = results.slice(0, limit).map((item, index: number) => {
        const entry = isRecord(item) ? item : {};
        const title = truncateText(entry.title, 120) || "Untitled";
        const link = typeof entry.url === "string" ? entry.url : "";
        const snippet = truncateText(entry.snippet, 240);
        const header = link
          ? `${index + 1}. [${title}](${link})`
          : `${index + 1}. ${title}`;
        return snippet ? `${header}\n   ${snippet}` : header;
      });

      const text =
        lines.length > 0
          ? `搜索引擎：${engine}\n关键词：${query}\n\n结果：\n${lines.join("\n")}`
          : `没有找到结果（${engine} / ${query}）。`;

      return {
        content: [{ type: "text", text }],
        data: results.slice(0, limit),
      };
    } finally {
      if (typeof tabId === "number") {
        await chrome.tabs.remove(tabId).catch(() => {});
      }
    }
  },
  WebFetch: async (args: Record<string, unknown> = {}) => {
    const url = normalizeHttpUrl(args.url);
    const maxChars = normalizeLimit(args.maxChars, 15000, 60000);

    if (!url) {
      return {
        content: [{ type: "text", text: "请输入有效的 http/https URL。" }],
        data: null,
      };
    }

    let tabId: number | null = null;
    try {
      const tab = await chrome.tabs.create({ url, active: false });
      tabId = typeof tab?.id === "number" ? tab.id : null;
      if (!tabId) {
        throw new Error("Failed to open page tab");
      }

      await waitForHttpTabReady({ tabId, timeoutMs: 25000 });
      const resp = await requestPrimaryContentFromTab({ tabId, maxChars });
      const payload = (resp && (resp.data || resp)) || {};

      const title = typeof payload?.title === "string" ? payload.title : "";
      const finalUrl = typeof payload?.url === "string" ? payload.url : url;
      const text = typeof payload?.text === "string" ? payload.text : "";
      const truncated = Boolean(payload?.truncated);

      const preview = truncateText(text, 900);
      const summaryLines = [
        `URL: ${finalUrl}`,
        title ? `标题: ${title}` : "",
        `字数: ${Number(payload?.wordCount) || 0} / chunks: ${Number(payload?.chunkCount) || 0}`,
        truncated ? "⚠️ 内容已截断" : "",
      ].filter(Boolean);

      const contentText =
        text.trim().length > 0
          ? `${summaryLines.join("\n")}\n\n主体内容（节选）：\n${preview}`
          : `${summaryLines.join("\n")}\n\n未能提取到主体内容。`;

      return {
        content: [{ type: "text", text: contentText }],
        data: {
          url: finalUrl,
          title,
          text,
          truncated,
          chunkCount: payload?.chunkCount || 0,
          wordCount: payload?.wordCount || 0,
        },
      };
    } finally {
      if (typeof tabId === "number") {
        await chrome.tabs.remove(tabId).catch(() => {});
      }
    }
  },
  CodeExecution: async (args: Record<string, unknown> = {}) => {
    try {
      const code = typeof args.code === "string" ? args.code : "";
      const timeoutMs =
        typeof args.timeoutMs === "number" ? args.timeoutMs : undefined;
      const maxResultChars =
        typeof args.maxResultChars === "number" ? args.maxResultChars : undefined;
      const result = await executeSandboxedCode({
        code,
        timeoutMs,
        maxResultChars,
      });

      const displayResult =
        result.resultType === "undefined"
          ? "undefined"
          : result.resultType === "string" && result.resultText === ""
            ? "（空字符串）"
            : result.resultText;

      const lines = [
        `执行成功${result.truncated ? "（结果已截断）" : ""}`,
        `类型: ${result.resultType}`,
        `结果: ${displayResult}`,
        `console.log输出结果：${
          result.consoleLogs.length ? result.consoleLogs.join("\n") : "无"
        }`,
      ];

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        data: result,
      };
    } catch (error) {
      const message = String((error as Error)?.message || error || "未知错误");
      return {
        content: [{ type: "text", text: `执行失败：${message}` }],
        data: { error: message },
        isError: true,
      };
    }
  },
  List: async (args: Record<string, unknown> = {}) => {
    const dir =
      typeof args.path === "string"
        ? args.path.trim()
        : typeof args.dir === "string"
          ? args.dir.trim()
          : "";
    const recursive = args.recursive !== false;
    const skillsDir = parseSkillsPath(dir);
    if (skillsDir) {
      const enabledSkills = (await listSkills()).filter(
        (skill) => skill.enabled,
      );
      if (skillsDir.kind === "root") {
        const data = await Promise.all(
          enabledSkills.map(async (skill) => {
            const file = await getSkillFile(skill.id, "SKILL.md");
            const content = file?.content || "";
            const lines = content ? content.split(/\r?\n/).length : 0;
            return {
              path: `/skills/${skill.name}/SKILL.md`,
              updatedAt: file?.updatedAt || skill.updatedAt,
              size: content.length,
              lines,
            };
          }),
        );
        const filtered = data.filter((item) => item.size > 0);
        const text =
          filtered.length > 0
            ? `技能文件列表：\n${filtered
                .map(
                  (file, index) =>
                    `${index + 1}. ${file.path} (${file.size} chars, ${file.lines} lines)`,
                )
                .join("\n")}`
            : "当前没有可用的技能文件。";
        return { content: [{ type: "text", text }], data: filtered };
      }

      const skill = enabledSkills.find(
        (item) =>
          item.id === skillsDir.skillName || item.name === skillsDir.skillName,
      );
      if (!skill) {
        return {
          content: [{ type: "text", text: "未找到指定的技能。" }],
          data: null,
          isError: true,
        };
      }
      const files = await listSkillFiles(skill.id);
      const prefix = skillsDir.filePath
        ? `${skillsDir.filePath.replace(/\/+$/, "")}/`
        : "";
      const filtered = files.filter((file) =>
        prefix ? file.path.startsWith(prefix) : true,
      );
      const scoped = recursive
        ? filtered
        : filtered.filter((file) => {
            const relative = prefix
              ? file.path.slice(prefix.length)
              : file.path;
            return !relative.includes("/");
          });
      const data = scoped.map((file) => ({
        path: `/skills/${skill.name}/${file.path}`,
        updatedAt: file.updatedAt,
        size: file.content.length,
        lines: file.content ? file.content.split(/\r?\n/).length : 0,
      }));
      const text =
        data.length > 0
          ? `技能文件列表：\n${data
              .map(
                (file, index) =>
                  `${index + 1}. ${file.path} (${file.size} chars, ${file.lines} lines)`,
              )
              .join("\n")}`
          : "当前目录没有文件。";
      return { content: [{ type: "text", text }], data };
    }

    const files = await listFiles(dir);
    const normalizedDir = normalizePath(dir);
    const prefix = normalizedDir ? `${normalizedDir.replace(/\/+$/, "")}/` : "";
    const scoped = recursive
      ? files
      : files.filter((file) => {
          const relative = prefix ? file.path.slice(prefix.length) : file.path;
          return !relative.includes("/");
        });
    const data = scoped.map((file) => ({
      path: file.path,
      updatedAt: file.updatedAt,
      size: file.content.length,
      lines: file.content ? file.content.split(/\r?\n/).length : 0,
    }));
    const text =
      data.length > 0
        ? `文件列表：\n${data
            .map(
              (file, index) =>
                `${index + 1}. ${file.path} (${file.size} chars, ${file.lines} lines)`,
            )
            .join("\n")}`
        : "当前目录没有文件。";
    return { content: [{ type: "text", text }], data };
  },
  Read: async (args: Record<string, unknown> = {}) => {
    const filePath =
      typeof args.path === "string"
        ? args.path.trim()
        : typeof args.file_path === "string"
          ? args.file_path.trim()
          : "";
    if (!filePath) {
      return {
        content: [{ type: "text", text: "path 是必填项。" }],
        data: null,
        isError: true,
      };
    }
    const skillsPath = parseSkillsPath(filePath);
    if (skillsPath) {
      if (skillsPath.kind === "root" || !skillsPath.skillName) {
        return {
          content: [
            { type: "text", text: "请提供 /skills/{skill}/... 路径。" },
          ],
          data: null,
          isError: true,
        };
      }
      const skill = await resolveEnabledSkill(skillsPath.skillName);
      if (!skill) {
        return {
          content: [{ type: "text", text: "未找到指定的技能。" }],
          data: null,
          isError: true,
        };
      }
      const resolvedPath = skillsPath.filePath || "SKILL.md";
      const record = await getSkillFile(skill.id, resolvedPath);
      if (!record) {
        return {
          content: [{ type: "text", text: "未找到指定的技能文件。" }],
          data: null,
          isError: true,
        };
      }
      const allLines = record.content.split(/\r?\n/);
      const startLine =
        typeof args.start_line === "number" &&
        Number.isFinite(args.start_line) &&
        args.start_line > 0
          ? Math.floor(args.start_line)
          : 1;
      const endLine =
        typeof args.end_line === "number" &&
        Number.isFinite(args.end_line) &&
        args.end_line > 0
          ? Math.floor(args.end_line)
          : allLines.length;
      const lineCount = Math.max(0, endLine - startLine + 1);
      const slice = allLines.slice(startLine - 1, startLine - 1 + lineCount);
      const text = slice.join("\n");
      return {
        content: [{ type: "text", text }],
        data: {
          path: `/skills/${skill.name}/${record.path}`,
          content: text,
          startLine,
          endLine: Math.min(allLines.length, startLine - 1 + lineCount),
          totalLines: allLines.length,
          updatedAt: record.updatedAt,
        },
      };
    }

    const record = await readFile(filePath);
    if (!record) {
      return {
        content: [{ type: "text", text: "未找到指定的文件。" }],
        data: null,
        isError: true,
      };
    }
    const allLines = record.content.split(/\r?\n/);
    const startLine =
      typeof args.start_line === "number" &&
      Number.isFinite(args.start_line) &&
      args.start_line > 0
        ? Math.floor(args.start_line)
        : 1;
    const endLine =
      typeof args.end_line === "number" &&
      Number.isFinite(args.end_line) &&
      args.end_line > 0
        ? Math.floor(args.end_line)
        : allLines.length;
    const lineCount = Math.max(0, endLine - startLine + 1);
    const slice = allLines.slice(startLine - 1, startLine - 1 + lineCount);
    const text = slice.join("\n");
    return {
      content: [{ type: "text", text }],
      data: {
        path: record.path,
        content: text,
        startLine,
        endLine: Math.min(allLines.length, startLine - 1 + lineCount),
        totalLines: allLines.length,
        updatedAt: record.updatedAt,
      },
    };
  },
  Write: async (args: Record<string, unknown> = {}) => {
    const filePath =
      typeof args.path === "string"
        ? args.path.trim()
        : typeof args.file_path === "string"
          ? args.file_path.trim()
          : "";
    const text =
      typeof args.content === "string"
        ? args.content
        : typeof args.text === "string"
          ? args.text
          : "";
    const line =
      typeof args.line === "number" &&
      Number.isFinite(args.line) &&
      args.line > 0
        ? Math.floor(args.line)
        : undefined;
    const append = args.append === true;
    if (!filePath) {
      return {
        content: [{ type: "text", text: "path 是必填项。" }],
        data: null,
        isError: true,
      };
    }
    if (parseSkillsPath(filePath)) {
      return {
        content: [{ type: "text", text: "不允许修改 /skills 下的文件。" }],
        data: null,
        isError: true,
      };
    }
    let record: VirtualFileRecord;
    if (append) {
      const existing = await readFile(filePath);
      const nextContent = existing?.content
        ? `${existing.content}\n${text}`
        : text;
      record = await writeFile(filePath, nextContent);
    } else {
      record = await writeFile(filePath, text, line);
    }
    return {
      content: [
        {
          type: "text",
          text: `写入成功：${record.path} (${record.content.length} chars)`,
        },
      ],
      data: record,
    };
  },
  Edit: async (args: Record<string, unknown> = {}) => {
    const filePath =
      typeof args.path === "string"
        ? args.path.trim()
        : typeof args.file_path === "string"
          ? args.file_path.trim()
          : "";
    const oldText =
      typeof args.old_string === "string"
        ? args.old_string
        : typeof args.old_text === "string"
          ? args.old_text
          : "";
    const newText =
      typeof args.new_string === "string"
        ? args.new_string
        : typeof args.new_text === "string"
          ? args.new_text
          : "";
    const replaceAll = args.replace_all === true;
    if (!filePath) {
      return {
        content: [{ type: "text", text: "path 是必填项。" }],
        data: null,
        isError: true,
      };
    }
    if (!oldText) {
      return {
        content: [{ type: "text", text: "old_string 是必填项。" }],
        data: null,
        isError: true,
      };
    }
    if (parseSkillsPath(filePath)) {
      return {
        content: [{ type: "text", text: "不允许修改 /skills 下的文件。" }],
        data: null,
        isError: true,
      };
    }
    const record = await readFile(filePath);
    if (!record) {
      return {
        content: [{ type: "text", text: "未找到指定的文件。" }],
        data: null,
        isError: true,
      };
    }
    if (!record.content.includes(oldText)) {
      return {
        content: [{ type: "text", text: "未找到需要替换的文本。" }],
        data: { path: record.path },
        isError: true,
      };
    }
    const nextContent = replaceAll
      ? record.content.split(oldText).join(newText)
      : record.content.replace(oldText, newText);
    const updated = await writeFile(record.path, nextContent);
    return {
      content: [
        {
          type: "text",
          text: `替换完成：${updated.path} (${updated.content.length} chars)`,
        },
      ],
      data: updated,
    };
  },
  Glob: async (args: Record<string, unknown> = {}) => {
    const rawPattern =
      typeof args.pattern === "string"
        ? args.pattern.trim()
        : typeof args.glob === "string"
          ? args.glob.trim()
          : typeof args.path === "string"
            ? args.path.trim()
            : "";
    if (!rawPattern) {
      return {
        content: [{ type: "text", text: "pattern 是必填项。" }],
        data: null,
        isError: true,
      };
    }
    const normalizedPattern =
      rawPattern.startsWith("/") && !rawPattern.startsWith("/skills/")
        ? rawPattern.slice(1)
        : rawPattern;
    const skillPattern =
      normalizedPattern.startsWith("skills/") || normalizedPattern === "skills"
        ? `/${normalizedPattern}`
        : normalizedPattern;
    const escapeRegex = (value: string) =>
      value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const globToRegex = (pattern: string) => {
      let regex = "^";
      let index = 0;
      while (index < pattern.length) {
        const char = pattern[index];
        if (char === "*") {
          if (pattern[index + 1] === "*") {
            index += 2;
            if (pattern[index] === "/") {
              regex += "(?:.*/)?";
              index += 1;
            } else {
              regex += ".*";
            }
            continue;
          }
          regex += "[^/]*";
          index += 1;
          continue;
        }
        if (char === "?") {
          regex += "[^/]";
          index += 1;
          continue;
        }
        regex += escapeRegex(char);
        index += 1;
      }
      regex += "$";
      return new RegExp(regex);
    };
    const regex = globToRegex(skillPattern);

    const fileRecords = await listFiles("");
    const vfsData = fileRecords.map((file) => ({
      path: file.path,
      updatedAt: file.updatedAt,
      size: file.content.length,
      lines: file.content ? file.content.split(/\r?\n/).length : 0,
    }));

    const skillFiles: Array<{
      path: string;
      updatedAt: string;
      size: number;
      lines: number;
    }> = [];
    const enabledSkills = (await listSkills()).filter((skill) => skill.enabled);
    for (const skill of enabledSkills) {
      const files = await listSkillFiles(skill.id);
      files.forEach((file) => {
        const path = `/skills/${skill.name}/${file.path}`;
        const size = file.content.length;
        skillFiles.push({
          path,
          updatedAt: file.updatedAt,
          size,
          lines: file.content ? file.content.split(/\r?\n/).length : 0,
        });
      });
    }

    const matched = [...vfsData, ...skillFiles].filter((file) =>
      regex.test(file.path),
    );
    const text =
      matched.length > 0
        ? `匹配到 ${matched.length} 个文件：\n${matched
            .map(
              (file, index) =>
                `${index + 1}. ${file.path} (${file.size} chars, ${file.lines} lines)`,
            )
            .join("\n")}`
        : "未找到匹配的文件。";
    return { content: [{ type: "text", text }], data: matched };
  },
  Task: async (args: Record<string, unknown> = {}) => {
    const payload = isRecord(args.payload) ? args.payload : args;
    const payloadKeys = Object.keys(payload);
    const meaningfulKeys = payloadKeys.filter(
      (key) => key !== "conversationId",
    );
    const isEmptyPayload = meaningfulKeys.length === 0;
    let action =
      normalizeTaskAction(payload.action) ||
      normalizeTaskAction(payload.op) ||
      normalizeTaskAction(payload.operation) ||
      normalizeTaskAction(payload.type) ||
      normalizeTaskAction(payload.method);
    const conversationId =
      typeof args.conversationId === "string" ? args.conversationId.trim() : "";
    if (!action) {
      const compat = resolveCompatTaskPayload(payload);
      if (compat) {
        if (!conversationId) {
          return {
            content: [
              {
                type: "text",
                text: "当前会话上下文不可用，无法执行 Task。",
              },
            ],
            data: null,
            isError: true,
          };
        }

        if (!compat.prompt) {
          return {
            content: [
              { type: "text", text: "Task 兼容模式缺少 prompt/description。" },
            ],
            data: null,
            isError: true,
          };
        }

        const systemLines = [
          "Task 兼容模式：请作为子代理执行以下任务。",
          compat.subagentType ? `子代理类型: ${compat.subagentType}` : "",
          compat.description ? `任务摘要: ${compat.description}` : "",
          compat.taskId ? `续跑 task_id: ${compat.taskId}` : "",
          compat.command ? `触发命令: ${compat.command}` : "",
        ].filter(Boolean);

        const result = await LOCAL_TOOL_HANDLERS.PromptingAgent({
          conversationId,
          payload: {
            prompt: compat.prompt,
            system: systemLines.join("\n"),
            outputFormat: "text",
          },
        });
        const data = {
          ...(isRecord(result.data) ? result.data : {}),
          compat: {
            subagent_type: compat.subagentType,
            task_id: compat.taskId,
            description: compat.description,
            command: compat.command,
            model: compat.model,
          },
        };
        return { ...result, data };
      }
    }
    if (!conversationId) {
      return {
        content: [
          {
            type: "text",
            text: "当前会话上下文不可用，无法执行 Task。",
          },
        ],
        data: null,
        isError: true,
      };
    }

    if (!action) {
      if (
        typeof payload.originalUserRequest === "string" ||
        typeof payload.goal === "string" ||
        Array.isArray(payload.tasks) ||
        Array.isArray(payload.assumptions)
      ) {
        action = "init";
      } else if (
        typeof payload.status === "string" ||
        typeof payload.currentTaskId === "string" ||
        typeof payload.summary === "string" ||
        typeof payload.outcome === "string" ||
        typeof payload.note === "string" ||
        (payload.patch && typeof payload.patch === "object")
      ) {
        action = "update";
      } else if (typeof payload.taskId === "string") {
        action = "update";
      } else if (
        typeof payload.summary === "string" ||
        typeof payload.outcome === "string"
      ) {
        action = "complete_all";
      } else if (
        typeof payload.onlyUnblocked === "boolean" ||
        Array.isArray(payload.statusList) ||
        Array.isArray(payload.status)
      ) {
        action = "list";
      } else {
        const existing = await getTaskPlan(conversationId);
        action = existing ? "list" : "get";
      }
    }

    if (action === "init") {
      const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
      const assumptions = Array.isArray(payload.assumptions)
        ? payload.assumptions
        : [];
      const plan = await initTaskPlan({
        conversationId,
        goal:
          typeof payload.goal === "string"
            ? payload.goal.trim()
            : typeof payload.originalUserRequest === "string"
              ? payload.originalUserRequest.trim()
              : "",
        tasks,
        assumptions,
        summary:
          typeof payload.summary === "string" ? payload.summary.trim() : "",
        status: parseTaskPlanStatus(payload.status),
      });
      const contentText = appendToolData("任务计划已初始化。", plan, 6000);
      return { content: [{ type: "text", text: contentText }], data: plan };
    }

    if (action === "update") {
      const taskId =
        typeof payload.taskId === "string" ? payload.taskId.trim() : "";
      if (taskId) {
        const patch = buildTaskItemPatch(
          isRecord(payload.patch) ? payload.patch : {},
        );
        const nextStatus = parseTaskStatus(payload.status);
        if (nextStatus) {
          patch.status = nextStatus;
        }
        if (typeof payload.summary === "string") {
          patch.summary = payload.summary.trim();
        }
        if (typeof payload.outcome === "string") {
          patch.outcome = payload.outcome.trim();
        }
        if (typeof payload.note === "string") {
          patch.appendNote = payload.note.trim();
        }
        const hasPatchKeys = Object.keys(patch).length > 0;
        const plan = hasPatchKeys
          ? await updateTaskItem({
              conversationId,
              taskId,
              patch: {
                ...patch,
              },
            })
          : await updateTaskStatus({
              conversationId,
              taskId,
              status: nextStatus,
            });
        const contentText = appendToolData("任务状态已更新。", plan, 6000);
        return { content: [{ type: "text", text: contentText }], data: plan };
      }
      const plan = await updateTaskPlanStatus({
        conversationId,
        status: parseTaskPlanStatus(payload.status),
        currentTaskId:
          typeof payload.currentTaskId === "string"
            ? payload.currentTaskId.trim()
            : undefined,
        goal: typeof payload.goal === "string" ? payload.goal.trim() : undefined,
        assumptions: Array.isArray(payload.assumptions)
          ? payload.assumptions
          : undefined,
        summary:
          typeof payload.summary === "string" ? payload.summary.trim() : undefined,
        outcome:
          typeof payload.outcome === "string" ? payload.outcome.trim() : undefined,
      });
      const contentText = appendToolData("计划状态已更新。", plan, 6000);
      return { content: [{ type: "text", text: contentText }], data: plan };
    }

    if (action === "get") {
      const plan = await getTaskPlan(conversationId);
      const hint = isEmptyPayload
        ? '提示: 调用 Task 时请提供 action 字段，例如 {"action":"get"}。'
        : "";
      const contentText = appendToolData(
        [hint, plan ? "已获取任务计划。" : "未找到任务计划。"]
          .filter(Boolean)
          .join("\n"),
        plan,
        6000,
      );
      return {
        content: [{ type: "text", text: contentText }],
        data: plan,
        isError: !plan,
      };
    }

    if (action === "list") {
      const onlyUnblocked = payload.onlyUnblocked !== false;
      const statusListSource = Array.isArray(payload.statusList)
        ? payload.statusList
        : Array.isArray(payload.status)
          ? payload.status
          : [];
      const statusList = statusListSource
        .map(parseTaskStatus)
        .filter((value): value is TaskStatus => Boolean(value));
      const data = onlyUnblocked
        ? await listUnblockedTasks({
            conversationId,
            status: statusList.length ? statusList : undefined,
          })
        : (await getTaskPlan(conversationId))?.tasks || [];
      const hint = isEmptyPayload
        ? '提示: 调用 Task 时请提供 action 字段，例如 {"action":"list"}。'
        : "";
      const contentText = appendToolData(
        [hint, data.length ? `已获取 ${data.length} 个任务。` : "未找到任务。"]
          .filter(Boolean)
          .join("\n"),
        data,
        6000,
      );
      return { content: [{ type: "text", text: contentText }], data };
    }

    if (action === "complete_all") {
      const plan = await completeAllTasks({
        conversationId,
        summary:
          typeof payload.summary === "string" ? payload.summary.trim() : undefined,
        outcome:
          typeof payload.outcome === "string" ? payload.outcome.trim() : undefined,
      });
      const contentText = appendToolData("所有任务已标记完成。", plan, 6000);
      return { content: [{ type: "text", text: contentText }], data: plan };
    }

    return {
      content: [{ type: "text", text: "action 不支持。" }],
      data: { action },
      isError: true,
    };
  },
  PromptingAgent: async (args: Record<string, unknown> = {}) => {
    const payload = isRecord(args.payload) ? args.payload : args;
    const prompt =
      typeof payload.prompt === "string" ? payload.prompt.trim() : "";
    const extraSystem =
      typeof payload.system === "string" ? payload.system.trim() : "";
    const outputFormat = payload.outputFormat === "json" ? "json" : "text";
    const requestedToolNames = Array.isArray(payload.toolNames)
      ? payload.toolNames.filter(
          (name): name is string =>
            typeof name === "string" && name.trim().length > 0,
        )
      : [];
    const requestedSkillNames = Array.isArray(payload.skillNames)
      ? payload.skillNames.filter(
          (name): name is string =>
            typeof name === "string" && name.trim().length > 0,
        )
      : [];
    const conversationId =
      typeof args.conversationId === "string" ? args.conversationId.trim() : "";

    if (!prompt) {
      return {
        content: [{ type: "text", text: "prompt 是必填项。" }],
        data: null,
        isError: true,
      };
    }

    const settings = await readSettings();
    if (!settings.aiAssistantEnabled) {
      return {
        content: [{ type: "text", text: "AI Assistant 未启用。" }],
        data: null,
        isError: true,
      };
    }

    const target = resolveAgentTarget(settings, "conversation");
    const session = createProviderSession(
      target.provider,
      settings.aiMcpServers || [],
    );

    const enableTools = Boolean(target.model.capabilities?.toolCalling);
    if (enableTools) {
      await session.connectMcp();
    }
    if (conversationId) {
      session.mcp.setConversationContext({ conversationId });
    }

    try {
      const rawTools = session
        .listTools()
        .filter((tool) => tool.name !== "PromptingAgent");
      const toolCandidates = rawTools.map((tool) => ({
        name: tool.name,
        description: tool.description || "",
        server: isRecord(tool) && typeof tool.server === "string" ? tool.server : "",
      }));

      let selectedTools: string[] = [];
      if (requestedToolNames.length > 0) {
        const candidateNames = new Set(toolCandidates.map((tool) => tool.name));
        selectedTools = requestedToolNames
          .map((name: string) => name.trim())
          .filter(
            (name: string) =>
              candidateNames.has(name) && name !== "PromptingAgent",
          );
      } else if (enableTools) {
        const selector = new ToolSelectionAgent();
        selectedTools = await selector.selectToolNames({
          prompt,
          tools: toolCandidates,
          client: session.client,
          model: target.model,
        });
      }

      if (
        selectedTools.includes("WebSearch") &&
        !selectedTools.includes("WebFetch")
      ) {
        selectedTools.push("WebFetch");
      }
      if (
        selectedTools.includes("WebFetch") &&
        !selectedTools.includes("WebSearch")
      ) {
        selectedTools.push("WebSearch");
      }

      if (enableTools) {
        session.mcp.setActiveToolFilter(
          selectedTools.length ? selectedTools : [],
        );
      }

      const allSkills = (await listSkills()).filter((skill) => skill.enabled);
      const skillCandidates = allSkills.map((skill) => ({
        name: skill.name,
        description: skill.description || "",
      }));

      let selectedSkills: string[] = [];
      if (requestedSkillNames.length > 0) {
        const candidateNames = new Set(
          skillCandidates.map((skill) => skill.name),
        );
        selectedSkills = requestedSkillNames
          .map((name: string) => name.trim())
          .filter((name: string) => candidateNames.has(name));
      } else if (skillCandidates.length > 0) {
        const selector = new SkillSelectionAgent();
        selectedSkills = await selector.selectSkillNames({
          prompt,
          skills: skillCandidates,
          client: session.client,
          model: target.model,
        });
      }

      const skillLines = selectedSkills
        .map((name) => {
          const skill = skillCandidates.find((item) => item.name === name);
          if (!skill) return name;
          return skill.description ? `${name} - ${skill.description}` : name;
        })
        .filter(Boolean);

      const systemLines = [
        "你是 PromptingAgent。",
        "目标：完成一次性子任务，必要时使用工具。",
        "不要向用户提问，直接给出结果。",
        outputFormat === "json" ? "输出必须为 JSON，不要额外文本。" : "",
        selectedTools.length ? `允许工具：${selectedTools.join(", ")}` : "",
        skillLines.length ? `已启用技能：${skillLines.join("；")}` : "",
        extraSystem,
      ].filter(Boolean);

      const request: ProviderChatCompletionRequest = {
        model: target.model.model,
        messages: injectSystemPromptAsUserMessage(
          [
            { role: "system", content: systemLines.join("\n") },
            { role: "user", content: prompt },
          ],
          Boolean(target.model?.systemPromptInUserMessage),
        ),
        temperature: outputFormat === "json" ? 0.1 : 0.2,
        stream: false,
      };

      const maxOutputTokens =
        typeof payload.maxOutputTokens === "number"
          ? Math.max(64, Math.min(2048, Math.floor(payload.maxOutputTokens)))
          : typeof target.model?.limits?.maxOutputTokens === "number"
            ? Math.max(
                64,
                Math.min(1024, Math.floor(target.model.limits.maxOutputTokens)),
              )
            : 512;
      const maxOutputTokenParam =
        target.model?.limits?.maxOutputTokenParam === "max_completion_tokens"
          ? "max_completion_tokens"
          : "max_tokens";
      if (maxOutputTokenParam === "max_completion_tokens") {
        request.max_completion_tokens = maxOutputTokens;
      } else {
        request.max_tokens = maxOutputTokens;
      }

      const usedTools = new Set<string>();
      const client = enableTools ? session.clientWithTools : session.client;
      const response = await client.createCompletion(request, {
        enableReasoning: Boolean(target.model?.capabilities?.reasoning),
        enableGeminiThinking: Boolean(target.model?.capabilities?.reasoning),
        ...(enableTools
          ? {
              tooling: {
                toolChoice: "auto",
                parallelToolCalls: false,
              },
              onToolCallMessage: (message: ProviderMessage) => {
                const calls = Array.isArray(message?.tool_calls)
                  ? message.tool_calls
                  : [];
                calls.forEach((call: ProviderToolCall) => {
                  const name =
                    String(call?.function?.name || "")
                      .split(":")
                      .pop() || "";
                  if (name) {
                    usedTools.add(name);
                  }
                });
              },
            }
          : {}),
      });

      const outputText = String(
        response?.choices?.[0]?.message?.content || "",
      ).trim();
      const data = {
        output: outputText,
        usedTools: Array.from(usedTools),
        skillNames: selectedSkills,
      };
      const contentText = appendToolData("PromptingAgent 已完成。", data, 6000);
      return { content: [{ type: "text", text: contentText }], data };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `PromptingAgent 失败：${(error as Error).message}`,
          },
        ],
        data: null,
        isError: true,
      };
    } finally {
      session.mcp.setConversationContext(null);
      session.mcp.setActiveToolFilter(null);
      if (enableTools) {
        await session.disconnectMcp().catch(() => {});
      }
    }
  },
  ListTabs: async (args: Record<string, unknown> = {}) => {
    const currentWindow = args.currentWindow !== false;
    const tabs = await chrome.tabs.query(
      currentWindow ? { currentWindow: true } : {},
    );
    const data = (tabs || []).map((tab) => ({
      id: tab.id,
      title: tab.title,
      url: tab.url,
      active: tab.active,
      windowId: tab.windowId,
    }));
    const contentText = appendToolData(
      data.length ? `已获取 ${data.length} 个标签页。` : "未找到标签页。",
      data,
      4000,
    );
    return {
      content: [
        {
          type: "text",
          text: contentText,
        },
      ],
      data,
    };
  },
  ActivateTab: async (args: Record<string, unknown> = {}) => {
    const tabId = typeof args.tabId === "number" ? args.tabId : null;
    if (typeof tabId !== "number") {
      return {
        content: [{ type: "text", text: "tabId 是必填项。" }],
        data: null,
        isError: true,
      };
    }
    try {
      const tab = (await chrome.tabs.update(tabId, { active: true }))!;
      if (typeof tab.windowId === "number") {
        try {
          await chrome.windows.update(tab.windowId, { focused: true });
        } catch {
          // ignore
        }
      }
      return {
        content: [
          {
            type: "text",
            text: appendToolData(
              "已激活指定标签页。",
              {
                id: tab.id,
                title: tab.title,
                url: tab.url,
                windowId: tab.windowId,
              },
              2000,
            ),
          },
        ],
        data: {
          id: tab.id,
          title: tab.title,
          url: tab.url,
          windowId: tab.windowId,
        },
      };
    } catch (error) {
      return {
        content: [
          { type: "text", text: `激活失败：${(error as Error).message}` },
        ],
        data: null,
        isError: true,
      };
    }
  },
  GotoPage: async (args: Record<string, unknown> = {}) => {
    const tabId = await resolveTabId(args.tabId);
    if (!tabId) {
      return {
        content: [{ type: "text", text: "未找到可操作的标签页。" }],
        data: null,
        isError: true,
      };
    }
    const url = normalizeHttpUrl(args.url);
    if (!url) {
      return {
        content: [{ type: "text", text: "请输入有效的 http/https URL。" }],
        data: null,
        isError: true,
      };
    }
    try {
      const tab = (await chrome.tabs.update(tabId, { url, active: true }))!;
      return {
        content: [
          {
            type: "text",
            text: appendToolData(
              "已在当前标签页打开指定页面。",
              {
                id: tab.id,
                title: tab.title,
                url: tab.url,
                windowId: tab.windowId,
              },
              2000,
            ),
          },
        ],
        data: {
          id: tab.id,
          title: tab.title,
          url: tab.url,
          windowId: tab.windowId,
        },
      };
    } catch (error) {
      return {
        content: [
          { type: "text", text: `打开页面失败：${(error as Error).message}` },
        ],
        data: null,
        isError: true,
      };
    }
  },
  NewTab: async (args: Record<string, unknown> = {}) => {
    const url = normalizeHttpUrl(args.url);
    if (!url) {
      return {
        content: [{ type: "text", text: "请输入有效的 http/https URL。" }],
        data: null,
        isError: true,
      };
    }
    const active = typeof args.active === "boolean" ? args.active : true;
    try {
      const tab = await chrome.tabs.create({ url, active });
      return {
        content: [
          {
            type: "text",
            text: appendToolData(
              "已打开新标签页。",
              {
                id: tab.id,
                title: tab.title,
                url: tab.url,
                windowId: tab.windowId,
              },
              2000,
            ),
          },
        ],
        data: {
          id: tab.id,
          title: tab.title,
          url: tab.url,
          windowId: tab.windowId,
        },
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `打开新标签页失败：${(error as Error).message}`,
          },
        ],
        data: null,
        isError: true,
      };
    }
  },
  RunDomActions: async (args: Record<string, unknown> = {}) => {
    const tabId = await resolveTabId(args.tabId);
    if (!tabId) {
      return {
        content: [{ type: "text", text: "未找到可操作的标签页。" }],
        data: null,
        isError: true,
      };
    }
    const actions = Array.isArray(args.actions) ? args.actions : [];
    const truncate = args.truncate === true;
    try {
      const indexedActions: Array<{
        action: Record<string, unknown>;
        index: number;
      }> = actions.map((action, index: number) => ({
        action: isRecord(action) ? action : {},
        index,
      }));
      const contentActions = indexedActions.filter(
        (entry) => entry.action.type !== "captureViewport",
      );
      const results: unknown[] = new Array(actions.length).fill(null);

      if (
        indexedActions.some((entry) => entry.action.type === "captureViewport")
      ) {
        const tab = await chrome.tabs.get(tabId).catch(() => null);
        const windowId =
          typeof tab?.windowId === "number" ? tab.windowId : null;
        if (windowId == null) {
          indexedActions.forEach((entry) => {
            if (entry.action.type === "captureViewport") {
              results[entry.index] = { ok: false, error: "无法获取窗口信息" };
            }
          });
        } else {
          for (const entry of indexedActions) {
            if (entry.action.type !== "captureViewport") continue;
            try {
              const format = "jpeg";
              const quality =
                typeof entry.action.quality === "number"
                  ? Math.max(1, Math.min(100, Math.floor(entry.action.quality)))
                  : undefined;
              const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
                format,
                ...(format === "jpeg" && typeof quality === "number"
                  ? { quality }
                  : {}),
              });
              let scaled: Awaited<ReturnType<typeof downscaleDataUrl>>;
              try {
                scaled = await downscaleDataUrl({
                  dataUrl,
                  format: "image/jpeg",
                  quality,
                  viewportWidth:
                    typeof tab?.width === "number" && tab.width > 0
                      ? tab.width
                      : null,
                  viewportHeight:
                    typeof tab?.height === "number" && tab.height > 0
                      ? tab.height
                      : null,
                });
              } catch {
                scaled = {
                  dataUrl,
                  width: 0,
                  height: 0,
                  originalWidth: 0,
                  originalHeight: 0,
                  format,
                };
              }
              results[entry.index] = {
                ok: true,
                result: {
                  format: scaled.format,
                  dataUrl: scaled.dataUrl,
                  width: scaled.width,
                  height: scaled.height,
                  originalWidth: scaled.originalWidth,
                  originalHeight: scaled.originalHeight,
                  scale:
                    scaled.originalWidth > 0
                      ? Math.round(
                          (scaled.width / scaled.originalWidth) * 1000,
                        ) / 1000
                      : undefined,
                },
              };
            } catch (error) {
              results[entry.index] = {
                ok: false,
                error: (error as Error).message,
              };
            }
          }
        }
      }

      if (contentActions.length > 0) {
        const resp = await chrome.tabs.sendMessage(tabId, {
          type: "myz:runDomActions",
          payload: { actions: contentActions.map((entry) => entry.action) },
        });
        const payload = resp?.data ?? resp;
        const actionResults = Array.isArray(payload?.results)
          ? payload.results
          : [];
        contentActions.forEach((entry, idx: number) => {
          results[entry.index] = actionResults[idx] ?? null;
        });
      }

      const payload: { results: unknown[] } = { results };
      const contentText = truncate
        ? appendToolData("DOM 操作已执行。", payload, 4000)
        : appendToolData("DOM 操作已执行。", payload, Number.MAX_SAFE_INTEGER);
      return {
        content: [{ type: "text", text: contentText }],
        data: payload,
      };
    } catch (error) {
      return {
        content: [
          { type: "text", text: `DOM 操作失败：${(error as Error).message}` },
        ],
        data: null,
        isError: true,
      };
    }
  },
  GetPageContext: async (args: Record<string, unknown> = {}) => {
    const tabId = await resolveTabId(args.tabId);
    if (!tabId) {
      return {
        content: [{ type: "text", text: "未找到可操作的标签页。" }],
        data: null,
        isError: true,
      };
    }
    const includeContent = args.includeContent !== false;
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    const payload: Record<string, unknown> = {
      url: tab?.url || "",
      title: tab?.title || "",
    };
    if (includeContent) {
      try {
        const resp = await chrome.tabs.sendMessage(tabId, {
          type: "myz:extractPageContent",
        });
        const contentData = isRecord(resp?.data) ? resp.data : resp;
        payload.content =
          isRecord(contentData) && typeof contentData.text === "string"
            ? contentData.text
            : "";
      } catch (error) {
        payload.content = "";
        payload.contentError = (error as Error).message;
      }
    }
    const contentText = appendToolData("已获取页面上下文。", payload, 6000);
    return {
      content: [{ type: "text", text: contentText }],
      data: payload,
    };
  },
  EvalInPage: async (args: Record<string, unknown> = {}) => {
    const tabId = await resolveTabId(args.tabId);
    if (!tabId) {
      return {
        content: [{ type: "text", text: "未找到可操作的标签页。" }],
        data: null,
        isError: true,
      };
    }
    const code = typeof args.code === "string" ? args.code : "";
    if (!code.trim()) {
      return {
        content: [{ type: "text", text: "code 是必填项。" }],
        data: null,
        isError: true,
      };
    }
    const truncate = args.truncate !== false;
    try {
      if (!chrome.scripting?.executeScript) {
        throw new Error("chrome.scripting 未启用");
      }
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: (payloadCode: string) => {
          const escapeXPathLiteral = (value: string) => {
            if (!value.includes("'")) return `'${value}'`;
            if (!value.includes('"')) return `"${value}"`;
            const parts = value.split("'");
            const joined = parts.map((part) => `'${part}'`).join(', "\'", ');
            return `concat(${joined})`;
          };

          const buildXPath = (element: Element) => {
            if (!element || element.nodeType !== Node.ELEMENT_NODE) return "";
            const id = (element as HTMLElement).id;
            if (id) {
              const escaped =
                typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id;
              const matches = document.querySelectorAll(`#${escaped}`);
              if (matches.length === 1) {
                return `//*[@id=${escapeXPathLiteral(id)}]`;
              }
            }
            const segments: string[] = [];
            let current: Element | null = element;
            while (current && current.nodeType === Node.ELEMENT_NODE) {
              const tag = current.tagName.toLowerCase();
              const parentElement: Element | null = current.parentElement;
              if (!parentElement) {
                segments.unshift(`/${tag}`);
                break;
              }
              const siblings = (
                Array.from(parentElement.children) as Element[]
              ).filter((child: Element) => child.tagName.toLowerCase() === tag);
              if (siblings.length > 1) {
                const index = siblings.indexOf(current) + 1;
                segments.unshift(`${tag}[${index}]`);
              } else {
                segments.unshift(tag);
              }
              current = parentElement;
            }
            if (!segments.length) return "";
            const normalized = segments[0].startsWith("/")
              ? segments.join("/")
              : `/${segments.join("/")}`;
            return normalized;
          };

          const buildElementSnapshot = (element: Element) => {
            const rect = element.getBoundingClientRect();
            const text =
              (element as HTMLElement).innerText ||
              (element as HTMLElement).textContent ||
              "";
            const href = (element as HTMLAnchorElement).href || "";
            return {
              tagName: element.tagName,
              id: (element as HTMLElement).id || "",
              className: (element as HTMLElement).className || "",
              xpath: buildXPath(element),
              text: text.trim().slice(0, 200),
              href,
              rect: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
                top: rect.top,
                left: rect.left,
                right: rect.right,
                bottom: rect.bottom,
              },
            };
          };

          const normalizeEvalResult = (value: unknown): unknown => {
            if (
              value == null ||
              typeof value === "string" ||
              typeof value === "number" ||
              typeof value === "boolean"
            ) {
              return value;
            }
            if (value instanceof Element) {
              return buildElementSnapshot(value);
            }
            try {
              return structuredClone(value);
            } catch {
              // ignore
            }
            try {
              return JSON.parse(JSON.stringify(value));
            } catch {
              return String(value);
            }
          };

          try {
            const runner = new Function(
              `"use strict"; return (async () => { ${payloadCode}\n})();`,
            );
            return Promise.resolve(runner())
              .then((value: unknown) => ({
                ok: true,
                result: normalizeEvalResult(value),
              }))
              .catch((error: unknown) => ({
                ok: false,
                error:
                  (error instanceof Error && error.message) || String(error),
              }));
          } catch (error: unknown) {
            return {
              ok: false,
              error:
                (error instanceof Error && error.message) || String(error),
            };
          }
        },
        args: [code],
      });
      const payload = {
        results: (results || []).map((entry) => ({
          frameId: entry.frameId,
          result: entry.result,
        })),
      };
      const contentText = truncate
        ? appendToolData("页面代码已执行。", payload, 4000)
        : appendToolData("页面代码已执行。", payload, Number.MAX_SAFE_INTEGER);
      return {
        content: [{ type: "text", text: contentText }],
        data: payload,
      };
    } catch (error) {
      return {
        content: [
          { type: "text", text: `执行失败：${(error as Error).message}` },
        ],
        data: null,
        isError: true,
      };
    }
  },
};

export { LOCAL_TOOL_DEFINITIONS, LOCAL_TOOL_HANDLERS };
