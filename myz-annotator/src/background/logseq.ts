import { DEFAULT_LOGSEQ_ENDPOINT, DEFAULT_LOGSEQ_PAGE } from "./constants.js";
import { describeHighlightStyle } from "@/shared/highlightUtils.js";
import { htmlToMarkdown, cleanLogseqMultiline } from "./markdown.js";

import { extractHostname } from "@/shared/url.js";
import { LogseqSettings } from "./settings.js";
import { MyZRecord } from "@/shared/types.js";

export interface LogseqBlock {
  content: string;
  children?: LogseqBlock[];
}

export interface LogseqApiRequest {
  endpoint: string;
  token: string;
  method: string;
  args?: any;
}

export interface LogseqEntity {
  uuid?: string;
  id?: string;
  content?: string;
  page?: LogseqEntity;
  block?: LogseqEntity;
  children?: LogseqEntity[];
}

export interface RecordBlockEntry {
  record: MyZRecord;
  block: LogseqBlock | null;
}

export function buildLogseqEndpointList(settings: LogseqSettings, payload: any = {}): string[] {
  const rawCandidates = [
    payload?.endpoint,
    settings.logseqEndpoint,
    DEFAULT_LOGSEQ_ENDPOINT,
  ];
  const endpoints: string[] = [];
  rawCandidates.forEach((candidate) => {
    const normalized = normalizeLogseqEndpoint(candidate);
    if (normalized && !endpoints.includes(normalized)) {
      endpoints.push(normalized);
    }
  });
  return endpoints;
}

function createLogseqHeaders(token: unknown): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const normalizedToken = typeof token === "string" ? token.trim() : "";
  if (normalizedToken) {
    headers.Authorization = normalizedToken.startsWith("Bearer ")
      ? normalizedToken
      : `Bearer ${normalizedToken}`;
  }
  return headers;
}

export async function callLogseq({ endpoint, token, method, args }: LogseqApiRequest) {
  if (!endpoint) {
    throw new Error("缺少 LogSeq API 地址");
  }
  if (!method) {
    throw new Error("缺少 LogSeq API 方法名");
  }
  const headers = createLogseqHeaders(token);
  const payload = {
    method,
    args: Array.isArray(args)
      ? args
      : typeof args === "undefined"
        ? []
        : [args],
  };
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(`LogSeq 请求失败：${response.status} ${text || ""}`.trim());
  }
  return interpretLogseqResponse(text);
}

export async function ensureLogseqPage({ endpoint, token, pageName }: {
  endpoint: string;
  token: string;
  pageName: string;
}): Promise<{ entity: any; uuid: string }> {
  const existing = await callLogseq({
    endpoint,
    token,
    method: "logseq.Editor.getPage",
    args: [pageName],
  });
  const existingUuid = extractEntityUuid(existing);
  if (existingUuid) {
    return { entity: existing, uuid: existingUuid };
  }

  const created = await callLogseq({
    endpoint,
    token,
    method: "logseq.Editor.createPage",
    args: [pageName, null, { createFirstBlock: true, redirect: false }],
  });
  const createdUuid = extractEntityUuid(created);
  if (createdUuid) {
    return { entity: created, uuid: createdUuid };
  }

  const fallback = await callLogseq({
    endpoint,
    token,
    method: "logseq.Editor.getPage",
    args: [pageName],
  });
  const fallbackUuid = extractEntityUuid(fallback);
  if (fallbackUuid) {
    return { entity: fallback, uuid: fallbackUuid };
  }

  throw new Error("无法获取 LogSeq 页面 UUID");
}

export function extractEntityUuid(entity: LogseqEntity | null | undefined): string {
  if (!entity || typeof entity !== "object") {
    return "";
  }
  if (typeof entity.uuid === "string" && entity.uuid.trim()) {
    return entity.uuid.trim();
  }
  if (entity.page && typeof entity.page === "object") {
    const nestedPage = extractEntityUuid(entity.page);
    if (nestedPage) {
      return nestedPage;
    }
  }
  if (entity.block && typeof entity.block === "object") {
    const nestedBlock = extractEntityUuid(entity.block);
    if (nestedBlock) {
      return nestedBlock;
    }
  }
  if (typeof entity.id === "string" && entity.id.includes("-")) {
    return entity.id.trim();
  }
  return "";
}

export function normalizeLogseqEndpoint(value: unknown): string {
  if (!value) {
    return "";
  }
  let candidate = String(value).trim();
  if (!candidate) {
    return "";
  }
  if (!/^https?:/i.test(candidate)) {
    candidate = `http://${candidate}`;
  }
  try {
    const url = new URL(candidate);
    let path = url.pathname || "";
    if (!path || path === "/") {
      path = "/api";
    } else if (path !== "/api") {
      path = path.startsWith("/api/") ? "/api" : "/api";
    }
    url.pathname = path;
    url.search = "";
    url.hash = "";
    const normalized = url.toString().replace(/\/$/, "");
    return normalized;
  } catch (error) {
    console.warn("Invalid LogSeq endpoint", value, error);
    return "";
  }
}

export function normalizeLogseqPageName(value: unknown): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || DEFAULT_LOGSEQ_PAGE;
}

export function buildLogseqBlocks(highlights: MyZRecord[], options: { exportedAt?: Date; title?: string } = {}) {
  const exportedAt =
    options.exportedAt instanceof Date ? options.exportedAt : new Date();
  const formattedTime = exportedAt.toLocaleString();
  const headerContent = (options.title || `MyZ 同步 ${formattedTime}`).trim();
  const highlightBlocks = highlights
    .map((record) => buildHighlightBlock(record))
    .filter(Boolean);

  if (!highlightBlocks.length) {
    return [];
  }

  const metadataBlocks = [
    makeBlock(`导出时间: ${formattedTime}`),
    makeBlock(`条目数: ${highlightBlocks.length}`),
  ].filter(Boolean);

  const headerBlock = makeBlock(headerContent, [
    ...metadataBlocks as LogseqBlock[],
    ...highlightBlocks as LogseqBlock[],
  ]);
  if (headerBlock) {
    return [headerBlock];
  }

  return highlightBlocks;
}

export function buildHighlightBlock(record: MyZRecord): LogseqBlock | null {
  if (!record) {
    return null;
  }
  const link = record.sourceUrl || record.url || "";
  const domain = link ? extractHostname(link) : "";
  const displayTitle = record.title || domain || "Untitled";
  const mainContent = link
    ? `[${cleanLogseqInline(displayTitle)}](${link})`
    : cleanLogseqInline(displayTitle);

  const detailBlocks = [];
  if (link) {
    detailBlocks.push(
      makeBlock(`页面：[${cleanLogseqInline(domain || link)}](${link})`),
    );
  }
  if (record.id) {
    detailBlocks.push(makeBlock(`ID: ${record.id}`));
  }
  if (record.createdAt) {
    const created = new Date(record.createdAt).toLocaleString();
    detailBlocks.push(makeBlock(`创建时间: ${cleanLogseqInline(created)}`));
  }
  const tags = Array.isArray(record.tags)
    ? record.tags
        .map((tag) => normalizeTagValue(tag))
        .filter(Boolean)
        .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
        .join(" ")
    : "";
  if (tags) {
    detailBlocks.push(makeBlock(`标签: ${tags}`));
  }

  if (record.kind === "highlight") {
    detailBlocks.push(
      makeBlock(`样式: ${describeHighlightStyle(record.style!)}`),
    );
  }

  const noteContent = extractRecordNote(record);
  if (noteContent) {
    const noteBlocks = makeMarkdownBlock(noteContent);
    if (noteBlocks?.length) {
      detailBlocks.push(makeBlock("批注", noteBlocks));
    }
  }

  const quoteContent = extractRecordQuote(record);
  if (quoteContent) {
    const quoteBlocks = makeMarkdownBlock(quoteContent);
    if (quoteBlocks?.length) {
      detailBlocks.push(makeBlock("摘录", quoteBlocks));
    }
  }

  return makeBlock(mainContent, detailBlocks.filter(Boolean) as LogseqBlock[]);
}

function makeBlock(content: string, children: LogseqBlock[] = []): LogseqBlock | null {
  const safeContent = cleanLogseqInline(content);
  if (!safeContent) {
    return null;
  }
  const block: LogseqBlock = { content: safeContent };
  const childBlocks = Array.isArray(children) ? children.filter(Boolean) : [];
  if (childBlocks.length) {
    block.children = childBlocks;
  }
  return block;
}

function cleanLogseqInline(value: unknown): string {
  if (!value) {
    return "";
  }
  return String(value)
    .replace(/[\s\u0000-\u001f\u007f]+/g, " ")
    .trim();
}

interface DocumentNode {
  level: number;
  indent: number;
  type: "paragraph" | "list" | "code" | "root";
  lines: string[];
  children: DocumentNode[];
}

function makeMarkdownBlock(content: string): LogseqBlock[] {
  const safeContent = cleanLogseqMultiline(content);
  if (!safeContent) {
    return [];
  }

  const root: DocumentNode = {
    level: -1,
    indent: -1,
    type: "root",
    lines: [],
    children: [],
  };
  const stack = [root];
  let currentParagraph: DocumentNode | null = null;
  let activeCodeBlock: DocumentNode | null = null;

  function flushParagraph() {
    if (currentParagraph && !currentParagraph.lines.length) {
      const index = root.children.indexOf(currentParagraph);
      if (index >= 0) {
        root.children.splice(index, 1);
      }
    }
    currentParagraph = null;
  }

  safeContent.split("\n").forEach((originalLine) => {
    const line = originalLine.replace(/\t/g, "  ");
    const trimmed = line.trim();

    if (activeCodeBlock) {
      activeCodeBlock.lines.push(originalLine);
      if (trimmed.startsWith("```") && activeCodeBlock !== null) {
        activeCodeBlock = null;
      }
      return;
    }

    if (!trimmed) {
      flushParagraph();
      return;
    }

    if (trimmed.startsWith("```")) {
      flushParagraph();
      const parentNode = stack[stack.length - 1];
      const codeNode: DocumentNode = {
        level: parentNode.level + 1,
        indent: parentNode.indent,
        type: "code",
        lines: [trimmed],
        children: [],
      };
      parentNode.children.push(codeNode);
      activeCodeBlock = codeNode;
      return;
    }

    const listMatch = line.match(/^(\s*)(?:[-*+]|(?:\d+)[.)])\s+(.*)$/);
    if (listMatch) {
      flushParagraph();
      const indentSpaces = listMatch[1].length;
      const level = Math.max(0, Math.floor(indentSpaces / 2));
      while (stack.length > 1 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }
      const parentNode = stack[stack.length - 1];
      const node: DocumentNode = {
        level,
        indent: indentSpaces,
        type: "list",
        lines: [listMatch[2].trim()],
        children: [],
      };
      parentNode.children.push(node);
      stack.push(node);
      return;
    }

    const indentSpaces = line.match(/^\s*/)?.[0].length ?? 0;
    while (stack.length > 1 && indentSpaces <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const currentNode = stack[stack.length - 1];
    if (currentNode.type !== "root" && indentSpaces > currentNode.indent) {
      currentNode.lines.push(trimmed);
      return;
    }

    stack.length = 1;
    if (!currentParagraph) {
      currentParagraph = {
        level: 0,
        indent: 0,
        type: "paragraph",
        lines: [],
        children: [],
      };
      root.children.push(currentParagraph);
    }
    currentParagraph.lines.push(trimmed);
  });

  function buildBlocks(nodes: DocumentNode[]): LogseqBlock[] {
    const blocks: LogseqBlock[] = [];
    nodes.forEach((node) => {
      const childBlocks = buildBlocks(node.children);
      const rawContent = node.lines
        .join(node.type === "code" ? "\n" : " ")
        .trim();
      if (!rawContent && !childBlocks.length) {
        return;
      }
      let content;
      if (node.type === "code") {
        content = cleanLogseqMultiline(node.lines.join("\n"));
      } else if (node.type === "paragraph") {
        content = cleanLogseqMultiline(node.lines.join("\n"));
      } else {
        content = cleanLogseqInline(rawContent);
      }
      if (!content && !childBlocks.length) {
        return;
      }
      const block: LogseqBlock = { content };
      if (childBlocks.length) {
        block.children = childBlocks;
      }
      blocks.push(block);
    });
    return blocks;
  }

  return buildBlocks(root.children);
}

function extractRecordQuote(record: Record<string, any>): string {
  const html = record?.html;
  if (html) {
    const markdown = htmlToMarkdown(html || "");
    const cleanedMarkdown = cleanLogseqMultiline(markdown);
    if (cleanedMarkdown) {
      return cleanedMarkdown;
    }
  }

  const rawText = typeof record?.text === "string" ? record.text : "";
  const cleanedText = cleanLogseqMultiline(rawText);
  if (cleanedText) {
    return cleanedText;
  }

  return "";
}

function extractRecordNote(record: Record<string, any>): string {
  const note = typeof record?.note === "string" ? record.note : "";
  if (!note) {
    return "";
  }
  return cleanLogseqMultiline(note);
}

export function extractInsertedBlockEntities(result: any): LogseqEntity[] {
  const collected: LogseqEntity[] = [];
  collectBlockEntities(result, collected);
  const unique: LogseqEntity[] = [];
  const seen = new Set();
  collected.forEach((entity) => {
    const uuid = extractEntityUuid(entity);
    if (!uuid || seen.has(uuid)) {
      return;
    }
    seen.add(uuid);
    unique.push(entity);
  });
  return unique;
}

function collectBlockEntities(node: any, bucket: LogseqEntity[]): void {
  if (!bucket || !Array.isArray(bucket)) {
    return;
  }
  if (!node) {
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item) => collectBlockEntities(item, bucket));
    return;
  }
  if (typeof node !== "object") {
    return;
  }
  if (typeof node.uuid === "string" && typeof node.content === "string") {
    bucket.push(node);
  }
  if (node.children) {
    collectBlockEntities(node.children, bucket);
  }
  if (node.block) {
    collectBlockEntities(node.block, bucket);
  }
  if (node.blocks) {
    collectBlockEntities(node.blocks, bucket);
  }
  if (node.result) {
    collectBlockEntities(node.result, bucket);
  }
  if (node.vector) {
    collectBlockEntities(node.vector, bucket);
  }
  if (node.data) {
    collectBlockEntities(node.data, bucket);
  }
  if (node.page) {
    collectBlockEntities(node.page, bucket);
  }
}

export async function matchInsertedHighlights({
  entries,
  candidates,
  pageName,
  endpoint,
  token,
}: {
  entries: RecordBlockEntry[],
  candidates: LogseqEntity[],
  pageName: string,
  endpoint: string,
  token: string,
}) {
  const matches = new Map();
  const usedUuids = new Set<string>();
  const safeEntries: RecordBlockEntry[] = Array.isArray(entries) ? entries : [];
  const safeCandidates: LogseqEntity[] = Array.isArray(candidates) ? candidates : [];

  safeEntries.forEach((entry) => {
    const matched = findMatchingBlock(entry, safeCandidates, usedUuids);
    if (matched) {
      matches.set(entry, matched);
    }
  });

  const remaining = safeEntries.filter((entry) => !matches.has(entry));
  if (remaining.length && endpoint && pageName) {
    try {
      const pageTree = await callLogseq({
        endpoint,
        token,
        method: "logseq.Editor.getPageBlocksTree",
        args: [pageName],
      });
      const pageCandidates = extractInsertedBlockEntities(pageTree);
      remaining.forEach((entry) => {
        const matched = findMatchingBlock(entry, pageCandidates, usedUuids);
        if (matched) {
          matches.set(entry, matched);
        }
      });
    } catch (error) {
      console.warn("读取 LogSeq 页面结构失败", error);
    }
  }

  if (matches.size !== safeEntries.length) {
    throw new Error("无法匹配所有新建的 LogSeq 块");
  }

  return matches;
}

function findMatchingBlock(entry: RecordBlockEntry, candidates: LogseqEntity[], usedUuids: Set<string>): LogseqEntity | null {
  const targetContent = cleanLogseqInline(entry?.block?.content || "");
  const idLine = entry?.record?.id
    ? cleanLogseqInline(`ID: ${entry.record.id}`)
    : "";
  if (!targetContent) {
    return null;
  }
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }
    const uuid = extractEntityUuid(candidate);
    if (!uuid || (usedUuids && usedUuids.has(uuid))) {
      continue;
    }
    const candidateContent = cleanLogseqInline(candidate.content || "");
    if (candidateContent !== targetContent) {
      continue;
    }
    if (idLine && !blockHasDescendantContent(candidate, idLine)) {
      continue;
    }
    if (usedUuids) {
      usedUuids.add(uuid);
    }
    return candidate;
  }
  return null;
}

function blockHasDescendantContent(block: LogseqEntity, targetContent: string): boolean {
  if (!targetContent) {
    return true;
  }
  const queue = Array.isArray(block?.children) ? [...block.children] : [];
  while (queue.length) {
    const node = queue.shift();
    if (!node || typeof node !== "object") {
      continue;
    }
    const content = cleanLogseqInline(node.content || "");
    if (content === targetContent) {
      return true;
    }
    if (Array.isArray(node.children) && node.children.length) {
      queue.push(...node.children);
    }
  }
  return false;
}

function interpretLogseqResponse(text: string): any {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (!trimmed) {
    return null;
  }
  if (trimmed.toLowerCase() === "ok") {
    return "ok";
  }

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`LogSeq API 响应无法解析：${trimmed}`);
  }

  if (parsed && typeof parsed === "object") {
    if ("error" in parsed && parsed.error) {
      const message =
        typeof parsed.error === "string"
          ? parsed.error
          : parsed.error.message || JSON.stringify(parsed.error);
      const err = new Error(message);
      if (parsed.error.code) {
        (err as any).code = parsed.error.code;
      }
      throw err;
    }
    if ("result" in parsed) {
      return parsed.result;
    }
  }

  return parsed;
}

export function normalizeTagValue(tag: unknown): string {
  return typeof tag === "string" ? tag.trim() : "";
}
