import type { Tool } from "@modelcontextprotocol/sdk/types.js"

/**
 * Local tools available to the AI assistant.
 *
 * Notes:
 * - Keep this file side-effect free so it can be safely imported by UI code.
 * - Tool implementations live in `local.ts`.
 */
export const LOCAL_TOOL_DEFINITIONS: Tool[] = [
  {
    name: "myz-select-tools",
    description:
      "当你需要调用工具但不确定该用哪些工具时，先调用这个工具：用中文描述你的信息需求，系统会选择并启用最相关的工具（在后续 tool call 中可用），以减少工具定义占用的 token。",
    inputSchema: {
      type: "object",
      required: ["need"],
      properties: {
        need: {
          type: "string",
          description: "用中文描述你需要通过工具完成的具体需求/目标。",
        },
      },
    },
  },
  {
    name: "myz-web-search",
    description:
      "通过浏览器打开搜索引擎页面进行网页搜索，并返回前几条结果（标题/链接/摘要），需要结合 myz-fetch-page 一起使用。",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: {
          type: "string",
          description: "搜索关键词。",
        },
        engine: {
          type: "string",
          enum: ["bing", "google"],
          default: "bing",
          description: "搜索引擎（默认 bing）。",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 10,
          default: 5,
          description: "返回的搜索结果数量上限，默认 5。",
        },
      },
    },
  },
  {
    name: "myz-fetch-page",
    description:
      "通过浏览器打开指定 URL，启发式提取网页主体内容详情（适用于访问搜索结果详情并进一步阅读/总结）。",
    inputSchema: {
      type: "object",
      required: ["url"],
      properties: {
        url: {
          type: "string",
          description: "要访问的网页 URL（仅支持 http/https）。",
        },
        maxChars: {
          type: "integer",
          minimum: 1000,
          maximum: 60000,
          default: 15000,
          description: "返回内容最大字符数（默认 15000）。",
        },
      },
    },
  },
  {
    name: "myz-code-execution",
    description:
      "在扩展沙箱 iframe 中执行 JavaScript 代码并返回结果（无扩展权限，适合轻量计算/文本处理）。",
    inputSchema: {
      type: "object",
      required: ["code"],
      properties: {
        code: {
          type: "string",
          description: "要执行的 JavaScript 代码（建议返回表达式结果）。",
        },
        timeoutMs: {
          type: "integer",
          minimum: 100,
          maximum: 5000,
          default: 1000,
          description: "执行超时时间（毫秒），默认 1000。",
        },
        maxResultChars: {
          type: "integer",
          minimum: 200,
          maximum: 8000,
          default: 2000,
          description: "返回结果最大字符数，超出将截断。",
        },
      },
    },
  },
]

export const LOCAL_TOOL_NAMES = LOCAL_TOOL_DEFINITIONS.map((tool) => tool.name)
