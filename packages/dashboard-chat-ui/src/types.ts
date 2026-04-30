export interface ChatImagePreviewState {
  visible: boolean
  dataUrl: string
  title?: string
}

export interface ChatAttachmentLike {
  type?: string
  dataUrl: string
  name?: string
}

export interface ChatMessageLike {
  id: string
  role?: string
  content?: string
  timestamp?: string
  reasoning_content?: string
  metadata?: {
    type?: string
    model?: string
    hasToolCalls?: boolean
    toolInvocationOnly?: boolean
    toolNames?: string[] | string
    toolCallCount?: number
    toolCallDetails?: unknown[]
    toolName?: string
    reasoning?: string
    reasoning_content?: string
    usage?: unknown
    contextWindow?: number
    requestDurationMs?: number
    streaming?: boolean
    streamingError?: string
    attachments?: ChatAttachmentLike[]
    selectionContextText?: string
    skillNames?: string[] | string
  }
}

export interface ChatStreamLike {
  id?: string | null
  content: string
  timestamp: string
  reasoning: string
}

export interface ChatToolInvocationDetail {
  id: string
  name: string
  arguments: string
}

export interface ChatToolResponseViewerState {
  visible: boolean
  toolName: string
  timestamp?: string
  args?: string
  content?: string
  invocationDetails: ChatToolInvocationDetail[]
}

export interface ChatSaveHighlightModalState {
  visible: boolean
  aiResponse: string
}
