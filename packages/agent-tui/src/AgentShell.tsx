import React from "react"
import { Box, Static, Text, useApp, useInput } from "ink"
import { ChatHistory, type ChatEntry } from "./ChatHistory"
import { InputBar } from "./InputBar"
import { StatusBar } from "./StatusBar"
import { PermissionModal } from "./PermissionModal"

export interface SubAgentStatus {
  agentId: string
  task: string
  status: "running" | "completed" | "error"
  progress?: string
}

export interface PermissionModalState {
  visible: boolean
  tool: string
  args: Record<string, unknown>
  riskLevel: "low" | "medium" | "high"
  defaultPattern: string
}

export interface AgentShellProps {
  agentId: string
  sessionId: string
  model: string
  workspace: string
  tokenUsed: number
  tokenTotal: number
  version: string
  todoProgress?: string
  subagentStatus?: SubAgentStatus
  viewingAgentId?: string  // 当前查看的 Agent ID，undefined 表示主 Agent
  permissionModal?: PermissionModalState
  onPermissionChoice?: (choice: "y" | "n" | "session" | "workspace", pattern?: string) => void
  entries: ChatEntry[]
  onMessage: (text: string) => void
}

export function __splitEntriesForTest(entries: ChatEntry[]) {
  return {
    completeEntries: entries.filter((entry) => entry.status !== "pending"),
    pendingEntries: entries.filter((entry) => entry.status === "pending"),
  }
}

function SubAgentStatusBar({ status }: { status: SubAgentStatus }) {
  const statusIcon = status.status === "running" ? "▸" : status.status === "completed" ? "✓" : "✗"
  const statusColor = status.status === "running" ? "yellow" : status.status === "completed" ? "green" : "red"

  return (
    <Box borderStyle="single" paddingLeft={1} paddingRight={1}>
      <Text color={statusColor} bold>{statusIcon} SubAgent: {status.agentId}</Text>
      <Text> — {status.task}</Text>
      {status.progress && <Text dimColor> ({status.progress})</Text>}
    </Box>
  )
}

export function AgentShell({
  agentId,
  sessionId,
  model,
  workspace,
  tokenUsed,
  tokenTotal,
  version,
  todoProgress,
  subagentStatus,
  viewingAgentId,
  permissionModal,
  onPermissionChoice,
  entries,
  onMessage,
}: AgentShellProps) {
  const { exit } = useApp()
  const { completeEntries, pendingEntries } = __splitEntriesForTest(entries)
  const isViewingSubAgent = viewingAgentId && viewingAgentId !== agentId

  useInput((input, key) => {
    if (key.ctrl && input === "c") exit()
  })

  return (
    <Box flexDirection="column" width="100%">
      {/* 权限审批 Modal */}
      {permissionModal?.visible && onPermissionChoice && (
        <PermissionModal
          tool={permissionModal.tool}
          args={permissionModal.args}
          riskLevel={permissionModal.riskLevel}
          defaultPattern={permissionModal.defaultPattern}
          onChoice={onPermissionChoice}
        />
      )}

      {/* SubAgent 状态栏 - 仅在主 Agent 视图且有活跃 SubAgent 时显示 */}
      {subagentStatus && !isViewingSubAgent && (
        <SubAgentStatusBar status={subagentStatus} />
      )}

      {/* 查看 SubAgent 历史时的标题 */}
      {isViewingSubAgent && (
        <Box borderStyle="single" paddingLeft={1} paddingRight={1}>
          <Text color="magenta" bold>Viewing SubAgent: {viewingAgentId}</Text>
          <Text dimColor> — Type /agents to switch back</Text>
        </Box>
      )}

      <Static items={completeEntries}>
        {(entry: ChatEntry, index) => (
          <ChatHistory key={entry.id || `${entry.role}-${index}`} entries={[entry]} />
        )}
      </Static>

      {pendingEntries.length > 0 && (
        <Box flexDirection="column">
          <ChatHistory entries={pendingEntries} />
        </Box>
      )}

      {/* 输入框 - 仅在主 Agent 视图时显示 */}
      {!isViewingSubAgent && <InputBar onSubmit={onMessage} />}

      <StatusBar
        workspace={workspace}
        model={model}
        tokenUsed={tokenUsed}
        tokenTotal={tokenTotal}
        agent={isViewingSubAgent ? viewingAgentId : agentId}
        version={version}
        todoProgress={todoProgress}
      />
    </Box>
  )
}
