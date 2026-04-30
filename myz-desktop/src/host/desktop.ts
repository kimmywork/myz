import type {
  DashboardHost,
  DashboardTheme,
  ImportStrategy,
  RecordExportResult,
  RecordImportResult,
  RecordQuery,
  SyncConfig,
  SyncRunReason,
  SyncRunResult,
  SyncStatus,
} from "@myz/dashboard-core/host";
import type { ConversationInfo, Message } from "@myz/ai-core/types";
import {
  DASHBOARD_HOST_CAPABILITY_PRESETS,
  DASHBOARD_HOST_FEATURE_PRESETS,
} from "@myz/dashboard-core/host";
import type { MyZRecord } from "@myz/shared";
import { invoke } from "@tauri-apps/api/core";
import type { DesktopStoredSettings } from "../dashboard/types/settings";

async function listRecords(_query?: RecordQuery): Promise<MyZRecord[]> {
  return invoke<MyZRecord[]>("desktop_list_records");
}

async function getRecord(recordId: string): Promise<MyZRecord | null> {
  return invoke<MyZRecord | null>("desktop_get_record", { recordId });
}

async function saveRecord(record: MyZRecord): Promise<MyZRecord> {
  return invoke<MyZRecord>("desktop_save_record", { record });
}

async function saveRecords(records: MyZRecord[]): Promise<MyZRecord[]> {
  return invoke<MyZRecord[]>("desktop_save_records", { records });
}

async function removeRecords(recordIds: string[]): Promise<void> {
  return invoke("desktop_remove_records", { recordIds });
}

async function exportRecords(): Promise<RecordExportResult> {
  return invoke<RecordExportResult>("desktop_export_records");
}

async function importRecords(input: {
  records: MyZRecord[];
  strategy: ImportStrategy;
}): Promise<RecordImportResult> {
  return invoke<RecordImportResult>("desktop_import_records", { input });
}

async function getSettings(): Promise<DesktopStoredSettings> {
  return invoke<DesktopStoredSettings>("desktop_get_settings");
}

async function updateSettings(
  patch: Partial<DesktopStoredSettings>,
): Promise<DesktopStoredSettings> {
  return invoke<DesktopStoredSettings>("desktop_update_settings", { patch });
}

async function getTheme(): Promise<DashboardTheme | null> {
  return invoke<DashboardTheme | null>("desktop_get_theme");
}

async function setTheme(theme: DashboardTheme): Promise<void> {
  return invoke("desktop_set_theme", { theme });
}

async function getSyncConfig(): Promise<SyncConfig> {
  return invoke<SyncConfig>("desktop_get_sync_config");
}

async function updateSyncConfig(
  patch: Partial<SyncConfig>,
): Promise<SyncConfig> {
  return invoke<SyncConfig>("desktop_update_sync_config", { patch });
}

async function getSyncStatus(): Promise<SyncStatus> {
  return invoke<SyncStatus>("desktop_get_sync_status");
}

async function runSync(reason?: SyncRunReason): Promise<SyncRunResult> {
  return invoke<SyncRunResult>("desktop_run_sync", { reason });
}

export interface DesktopChatRepository {
  listConversations(): Promise<ConversationInfo[]>;
  getConversation(conversationId: string): Promise<ConversationInfo | null>;
  saveConversation(conversation: ConversationInfo): Promise<ConversationInfo>;
  deleteConversation(conversationId: string): Promise<void>;
  getMessages(conversationId: string): Promise<Message[]>;
  replaceMessages(
    conversationId: string,
    messages: Message[],
  ): Promise<Message[]>;
  getActiveConversationId(): Promise<string | null>;
  setActiveConversationId(
    conversationId: string | null,
  ): Promise<string | null>;
  getWorkspaceContext(): Promise<DesktopWorkspaceContext>;
}

export interface DesktopWorkspaceContext {
  workspaceRoot: string;
  agentsFile: string;
  scopeLabel: string;
}

export interface DesktopWorkspaceEntry {
  path: string;
  kind: string;
}

export interface DesktopWorkspaceListResult {
  basePath: string;
  entries: DesktopWorkspaceEntry[];
}

export interface DesktopWorkspaceReadResult {
  path: string;
  content: string;
}

export interface DesktopWorkspaceWriteInput {
  path: string;
  content: string;
  mode?: string;
}

export interface DesktopWorkspaceWriteResult {
  path: string;
  mode: string;
  bytesWritten: number;
}

export interface DesktopWorkspaceEditInput {
  path: string;
  find: string;
  replace: string;
  replaceAll?: boolean;
}

export interface DesktopWorkspaceEditResult {
  path: string;
  replacements: number;
}

export interface DesktopWorkspaceGlobResult {
  pattern: string;
  matches: string[];
}

export interface DesktopAgentToolHost {
  listWorkspace(
    path?: string,
    depth?: number,
  ): Promise<DesktopWorkspaceListResult>;
  readWorkspaceFile(path: string): Promise<DesktopWorkspaceReadResult>;
  writeWorkspaceFile(
    input: DesktopWorkspaceWriteInput,
  ): Promise<DesktopWorkspaceWriteResult>;
  editWorkspaceFile(
    input: DesktopWorkspaceEditInput,
  ): Promise<DesktopWorkspaceEditResult>;
  globWorkspace(pattern: string): Promise<DesktopWorkspaceGlobResult>;
}

async function listConversations(): Promise<ConversationInfo[]> {
  return invoke<ConversationInfo[]>("desktop_chat_list_conversations");
}

async function getConversation(
  conversationId: string,
): Promise<ConversationInfo | null> {
  return invoke<ConversationInfo | null>("desktop_chat_get_conversation", {
    conversationId,
  });
}

async function saveConversation(
  conversation: ConversationInfo,
): Promise<ConversationInfo> {
  return invoke<ConversationInfo>("desktop_chat_save_conversation", {
    conversation,
  });
}

async function deleteConversation(conversationId: string): Promise<void> {
  return invoke("desktop_chat_delete_conversation", { conversationId });
}

async function getMessages(conversationId: string): Promise<Message[]> {
  return invoke<Message[]>("desktop_chat_get_messages", { conversationId });
}

async function replaceMessages(
  conversationId: string,
  messages: Message[],
): Promise<Message[]> {
  return invoke<Message[]>("desktop_chat_replace_messages", {
    conversationId,
    messages,
  });
}

async function getActiveConversationId(): Promise<string | null> {
  return invoke<string | null>("desktop_chat_get_active_conversation_id");
}

async function setActiveConversationId(
  conversationId: string | null,
): Promise<string | null> {
  return invoke<string | null>("desktop_chat_set_active_conversation_id", {
    conversationId,
  });
}

async function getWorkspaceContext(): Promise<DesktopWorkspaceContext> {
  return invoke<DesktopWorkspaceContext>("desktop_chat_get_workspace_context");
}

async function listWorkspace(
  path?: string,
  depth?: number,
): Promise<DesktopWorkspaceListResult> {
  return invoke<DesktopWorkspaceListResult>("desktop_agent_list_workspace", {
    path,
    depth,
  });
}

async function readWorkspaceFile(
  path: string,
): Promise<DesktopWorkspaceReadResult> {
  return invoke<DesktopWorkspaceReadResult>(
    "desktop_agent_read_workspace_file",
    {
      path,
    },
  );
}

async function writeWorkspaceFile(
  input: DesktopWorkspaceWriteInput,
): Promise<DesktopWorkspaceWriteResult> {
  return invoke<DesktopWorkspaceWriteResult>(
    "desktop_agent_write_workspace_file",
    {
      input,
    },
  );
}

async function editWorkspaceFile(
  input: DesktopWorkspaceEditInput,
): Promise<DesktopWorkspaceEditResult> {
  return invoke<DesktopWorkspaceEditResult>(
    "desktop_agent_edit_workspace_file",
    {
      input,
    },
  );
}

async function globWorkspace(
  pattern: string,
): Promise<DesktopWorkspaceGlobResult> {
  return invoke<DesktopWorkspaceGlobResult>("desktop_agent_glob_workspace", {
    input: { pattern },
  });
}

export function createDesktopDashboardHost(): DashboardHost<DesktopStoredSettings> {
  return {
    kind: "desktop",
    capabilities: DASHBOARD_HOST_CAPABILITY_PRESETS.desktop,
    features: DASHBOARD_HOST_FEATURE_PRESETS.desktop,
    records: {
      listRecords,
      getRecord,
      saveRecord,
      saveRecords,
      removeRecords,
      exportRecords,
      importRecords,
    },
    settings: {
      getSettings,
      updateSettings,
    },
    theme: {
      getTheme,
      setTheme,
    },
    sync: {
      getConfig: getSyncConfig,
      updateConfig: updateSyncConfig,
      getStatus: getSyncStatus,
      runSync,
    },
  };
}

export const desktopDashboardHost = createDesktopDashboardHost();

export const desktopChatHost: DesktopChatRepository = {
  listConversations,
  getConversation,
  saveConversation,
  deleteConversation,
  getMessages,
  replaceMessages,
  getActiveConversationId,
  setActiveConversationId,
  getWorkspaceContext,
};

export const desktopAgentHost: DesktopAgentToolHost = {
  listWorkspace,
  readWorkspaceFile,
  writeWorkspaceFile,
  editWorkspaceFile,
  globWorkspace,
};
