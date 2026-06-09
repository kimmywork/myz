import type { Tool } from "@modelcontextprotocol/sdk/types.js"
import type { ToolExecutionResult } from "@myz/ai-core/types"
import type { KnowledgeLayer } from "./types"
import {
  createEntry,
  getEntry,
  updateEntry,
  deleteEntry,
  listEntries,
  searchEntries,
} from "./knowledgeStore"

function textBlock(text: string): ToolExecutionResult {
  return { content: [{ type: "text", text }] }
}

function errorBlock(text: string): ToolExecutionResult {
  return { content: [{ type: "text", text }], isError: true }
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

export function createKnowledgeTools(options: {
  knowledgeDir: string
}): { definitions: Tool[]; handlers: Record<string, (args: Record<string, unknown>) => Promise<ToolExecutionResult>> } {
  const { knowledgeDir } = options

  const definitions: Tool[] = [
    {
      name: "Knowledge",
      description: "查询、创建、更新知识库条目。支持按层、标签、关键词搜索。",
      inputSchema: {
        type: "object",
        required: ["action"],
        properties: {
          action: {
            type: "string",
            enum: ["search", "get", "create", "update", "delete", "list"],
          },
          query: { type: "string", description: "搜索关键词" },
          layer: {
            type: "string",
            enum: ["concepts", "structure", "behavior", "ops"],
          },
          tags: { type: "array", items: { type: "string" } },
          entryId: { type: "string", description: "条目 ID（用于 get/update/delete）" },
          title: { type: "string", description: "标题（用于 create/update）" },
          content: { type: "string", description: "内容（用于 create/update）" },
          confidence: { type: "number", description: "置信度 0-1" },
          expiresAt: { type: "string", description: "过期时间 ISO8601" },
          limit: { type: "integer" },
        },
      },
    },
  ]

  const handlers: Record<string, (args: Record<string, unknown>) => Promise<ToolExecutionResult>> = {
    Knowledge: async (args) => {
      try {
        const action = typeof args.action === "string" ? args.action : ""
        const layer = typeof args.layer === "string" ? (args.layer as KnowledgeLayer) : undefined

        switch (action) {
          case "search": {
            const query = typeof args.query === "string" ? args.query : ""
            const limit = typeof args.limit === "number" ? args.limit : 10
            const results = searchEntries(knowledgeDir, query, { layer, limit })
            return textBlock(formatJson(results))
          }

          case "list": {
            const tags = Array.isArray(args.tags) ? (args.tags as string[]) : undefined
            const results = listEntries(knowledgeDir, { layer, tags })
            return textBlock(formatJson(results))
          }

          case "get": {
            const entryId = typeof args.entryId === "string" ? args.entryId : ""
            if (!entryId) return errorBlock("entryId 必填")
            const entry = getEntry(knowledgeDir, entryId)
            if (!entry) return errorBlock(`条目不存在: ${entryId}`)
            return textBlock(formatJson(entry))
          }

          case "create": {
            const title = typeof args.title === "string" ? args.title : ""
            const content = typeof args.content === "string" ? args.content : ""
            if (!title || !content) return errorBlock("title 和 content 必填")
            if (!layer) return errorBlock("layer 必填")
            const tags = Array.isArray(args.tags) ? (args.tags as string[]) : []
            const confidence = typeof args.confidence === "number" ? args.confidence : 0.5
            const expiresAt = typeof args.expiresAt === "string" ? args.expiresAt : undefined
            const entry = createEntry(knowledgeDir, layer, {
              title,
              body: content,
              tags,
              confidence,
              expiresAt,
            })
            return textBlock(`已创建: ${entry.meta.id}\n${formatJson(entry.meta)}`)
          }

          case "update": {
            const entryId = typeof args.entryId === "string" ? args.entryId : ""
            if (!entryId) return errorBlock("entryId 必填")
            const patch: Record<string, unknown> = {}
            if (typeof args.title === "string") patch.title = args.title
            if (typeof args.content === "string") patch.body = args.content
            if (Array.isArray(args.tags)) patch.tags = args.tags
            if (typeof args.confidence === "number") patch.confidence = args.confidence
            if (typeof args.expiresAt === "string") patch.expiresAt = args.expiresAt
            const updated = updateEntry(knowledgeDir, entryId, patch as any)
            if (!updated) return errorBlock(`条目不存在: ${entryId}`)
            return textBlock(`已更新: ${entryId}\n${formatJson(updated.meta)}`)
          }

          case "delete": {
            const entryId = typeof args.entryId === "string" ? args.entryId : ""
            if (!entryId) return errorBlock("entryId 必填")
            const deleted = deleteEntry(knowledgeDir, entryId)
            if (!deleted) return errorBlock(`条目不存在: ${entryId}`)
            return textBlock(`已删除: ${entryId}`)
          }

          default:
            return errorBlock(`未知 action: ${action}`)
        }
      } catch (error) {
        return errorBlock(`知识库操作失败: ${(error as Error).message}`)
      }
    },
  }

  return { definitions, handlers }
}
