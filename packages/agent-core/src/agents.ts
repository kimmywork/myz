import { readFileSync, existsSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import type { AgentDefinition, PermissionRule } from "./types"

function parseFrontmatter(content: string): { meta: Record<string, unknown>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { meta: {}, body: content.trim() }
  const [, yamlStr, body] = match
  const meta: Record<string, unknown> = {}
  for (const line of yamlStr.split("\n")) {
    const kv = line.match(/^(\w+):\s*(.+)$/)
    if (kv) {
      const [, key, raw] = kv
      const val = raw.trim()
      if (val === "true") meta[key] = true
      else if (val === "false") meta[key] = false
      else if (/^\d+$/.test(val)) meta[key] = Number(val)
      else meta[key] = val
    }
  }
  return { meta, body: body.trim() }
}

function parsePermissions(raw: unknown): PermissionRule[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
    .map((r) => ({
      pattern: String(r.pattern || ""),
      action: (["allow", "ask", "deny"].includes(String(r.action)) ? r.action : "allow") as PermissionRule["action"],
    }))
    .filter((r) => r.pattern)
}

function parseTools(raw: unknown): string[] | undefined {
  if (typeof raw !== "string") return undefined
  return raw.split(",").map((t) => t.trim()).filter(Boolean)
}

export function loadAgentDefinitions(agentsDir: string): AgentDefinition[] {
  if (!existsSync(agentsDir)) return []
  const files = readdirSync(agentsDir).filter((f) => f.endsWith(".md"))
  const agents: AgentDefinition[] = []
  for (const file of files) {
    const content = readFileSync(resolve(agentsDir, file), "utf-8")
    const { meta, body } = parseFrontmatter(content)
    const id = file.replace(/\.md$/, "")
    agents.push({
      id,
      name: typeof meta.name === "string" ? meta.name : undefined,
      description: String(meta.description || ""),
      mode: (["primary", "subagent"].includes(String(meta.mode)) ? meta.mode : "primary") as "primary" | "subagent",
      model: typeof meta.model === "string" ? meta.model : undefined,
      tools: parseTools(meta.tools),
      permissions: parsePermissions(meta.permissions),
      prompt: body,
      hidden: meta.hidden === true,
      maxSteps: typeof meta.maxSteps === "number" ? meta.maxSteps : undefined,
    })
  }
  return agents
}

export function loadBuiltinAgentDefinitions(): AgentDefinition[] {
  return [
    {
      id: "main",
      description: "主 Agent，拥有完整权限",
      mode: "primary",
      permissions: [
        { pattern: "*", action: "allow" },
      ],
      prompt: BUILTIN_MAIN_PROMPT,
    },
    {
      id: "plan",
      description: "只读分析和规划 agent",
      mode: "primary",
      permissions: [
        { pattern: "read", action: "allow" },
        { pattern: "edit", action: "deny" },
        { pattern: "bash", action: "deny" },
      ],
      prompt: BUILTIN_PLAN_PROMPT,
    },
    {
      id: "explore",
      description: "快速代码搜索",
      mode: "subagent",
      hidden: true,
      tools: ["List", "Read", "Glob", "Grep"],
      maxSteps: 0,  // 无限制（只读操作）
      permissions: [
        { pattern: "read", action: "allow" },
        { pattern: "edit", action: "deny" },
        { pattern: "bash", action: "deny" },
      ],
      prompt: BUILTIN_EXPLORE_PROMPT,
    },
    {
      id: "general",
      description: "多步骤通用任务",
      mode: "subagent",
      permissions: [
        { pattern: "*", action: "allow" },
      ],
      prompt: BUILTIN_GENERAL_PROMPT,
    },
  ]
}

const BUILTIN_MAIN_PROMPT = `你是 myz agent，拥有完整的文件和命令操作权限。

## 规则
- 先读 AGENTS.md 了解项目约定
- 修改文件前先读取目标文件
- 编辑使用精确匹配（oldString → newString），不要重写整个文件
- 运行命令后检查输出，有错误立即修复
- 不要编造不存在的文件或函数
- 不泄露密钥、token、密码等敏感信息

## 交互
- 需求不清楚时先问，不要猜
- 工具调用前用一句话说明要做什么
- 结果出来后给简短反馈
- 完成任务后运行 lint/typecheck 验证

## SubAgent 使用
- 当需要分析大量代码或搜索文件时，使用 SubAgent(agentId: "explore", task: "...")
- 当需要规划复杂任务时，使用 SubAgent(agentId: "plan", task: "...")
- 当需要执行多步骤任务时，使用 SubAgent(prompt: "...", task: "...")`

const BUILTIN_PLAN_PROMPT = `你是 myz agent 的规划模式，专注于分析和方案设计。

## 规则
- 只分析，不修改任何文件
- 输出结构化的实施计划
- 引用具体文件路径和行号
- 评估每个变更的风险和影响

## 输出格式
每个方案包含：
1. 目标：要解决什么问题
2. 影响范围：涉及哪些文件
3. 具体步骤：按顺序列出每个变更
4. 验证方式：如何确认变更正确
5. 风险点：需要注意什么`

const BUILTIN_EXPLORE_PROMPT = `你是代码搜索 agent，快速定位文件和代码位置。

## 规则
- 只读，不修改任何文件
- 报告格式：file:line_number + 一句话描述
- 最多返回 20 条结果
- 搜索要全面但结果要精炼`

const BUILTIN_GENERAL_PROMPT = `你是通用任务 agent，处理多步骤复杂任务。

## 规则
- 完成任务后向调用者报告结果摘要
- 如果任务无法完成，说明原因和阻塞点
- 保持操作记录，方便追溯`
