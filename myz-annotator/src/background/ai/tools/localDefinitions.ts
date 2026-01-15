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
    name: "myz-list-hosts",
    description:
      "列出所有保存过的站点 host 以及对应的标注数量，按数量降序排序。",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "myz-popular-tags",
    description: "列出最常用的标签及其出现次数，按次数降序排序。",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          default: 20,
          description: "返回的标签数量上限，默认 20。",
        },
      },
    },
  },
  {
    name: "myz-search-highlights",
    description:
      "按关键词搜索已保存的标注，匹配文本、笔记或标签，返回最近的匹配项。",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: {
          type: "string",
          description: "要搜索的关键词。",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          default: 10,
          description: "返回的匹配数量上限，默认 10。",
        },
      },
    },
  },
  {
    name: "myz-filter-by-date",
    description: "按日期范围筛选标注，返回最近的标注，日期格式 YYYY-MM-DD。",
    inputSchema: {
      type: "object",
      properties: {
        from: {
          type: "string",
          description: "开始日期（包含），格式 YYYY-MM-DD。",
        },
        to: {
          type: "string",
          description: "结束日期（包含），格式 YYYY-MM-DD。",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          default: 20,
          description: "返回的标注数量上限，默认 20。",
        },
      },
    },
  },
  {
    name: "myz-filter-by-tag-or-host",
    description:
      "按标签或站点 host 筛选标注，可同时指定多个标签，返回最近的标注。",
    inputSchema: {
      type: "object",
      properties: {
        tags: {
          type: "array",
          items: { type: "string" },
          description: "要匹配的标签列表，全部匹配才会返回。",
        },
        host: {
          type: "string",
          description: "要匹配的站点 host。",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          default: 20,
          description: "返回的标注数量上限，默认 20。",
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
]

export const LOCAL_TOOL_NAMES = LOCAL_TOOL_DEFINITIONS.map((tool) => tool.name)
