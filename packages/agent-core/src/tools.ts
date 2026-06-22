import type { ToolDefinition, ToolResult } from "./types"

export interface LocalTool {
  definition: ToolDefinition
  handler: (args: Record<string, unknown>, context?: { agentId: string; sessionId: string; workspaceRoot: string }) => Promise<ToolResult> | ToolResult
}

export function createLocalTools(options: {
  workspaceRoot: string
  toolAllowlist?: string[]
  toolDenylist?: string[]
}): LocalTool[] {
  const tools: LocalTool[] = []
  const denyset = new Set((options.toolDenylist || []).map((s) => s.toLowerCase()))
  const allowset = options.toolAllowlist?.length ? new Set(options.toolAllowlist.map((s) => s.toLowerCase())) : null

  const isEnabled = (name: string) => {
    const n = name.toLowerCase()
    if (denyset.has(n)) return false
    if (allowset && !allowset.has(n)) return false
    return true
  }

  const defs: ToolDefinition[] = [
    { name: "List", description: "列出目录下的文件", inputSchema: { type: "object", properties: { path: { type: "string" } } } },
    { name: "Read", description: "读取文件内容", inputSchema: { type: "object", required: ["path"], properties: { path: { type: "string" } } } },
    { name: "Write", description: "写入文件内容", inputSchema: { type: "object", required: ["path", "content"], properties: { path: { type: "string" }, content: { type: "string" } } } },
    { name: "Edit", description: "替换文件内容", inputSchema: { type: "object", required: ["path", "oldText", "newText"], properties: { path: { type: "string" }, oldText: { type: "string" }, newText: { type: "string" } } } },
    { name: "Glob", description: "按模式匹配文件", inputSchema: { type: "object", required: ["pattern"], properties: { pattern: { type: "string" } } } },
    { name: "Run", description: "执行命令", inputSchema: { type: "object", required: ["command"], properties: { command: { type: "string" } } } },
  ]

  for (const def of defs) {
    if (isEnabled(def.name)) {
      tools.push({ definition: def, handler: async () => ({ content: [{ type: "text", text: "工具未实现" }] }) })
    }
  }

  return tools
}
