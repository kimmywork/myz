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
]

export const LOCAL_TOOL_NAMES = LOCAL_TOOL_DEFINITIONS.map((tool) => tool.name)

