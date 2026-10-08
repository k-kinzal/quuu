export interface AssistantSettings {
  enabled: boolean
  intervalHours: number
  confidenceThreshold: number
}

export const DEFAULT_ASSISTANT_SETTINGS: AssistantSettings = {
  enabled: true, intervalHours: 6, confidenceThreshold: 70
}

export interface AssistantProposal {
  taskId: string
  projectId: string
  title: string
  prompt: string
  reason: string
  confidence: number
  status: 'pending' | 'accepted' | 'dismissed'
  createdAt: string
  respondedAt: string | null
  executionTaskId: string | null
}

export interface AssistantCheck {
  taskId: string
  createdAt: string
  settledAt: string | null
  error: string | null
}

export interface AssistantThread {
  taskId: string
  preview: string
  replies: number
  revision: string
  unread: boolean
}

export interface AssistantState {
  settings: AssistantSettings
  activity: 'off' | 'waiting' | 'checking' | 'awaiting-response'
  lastCheckAt: string | null
  nextCheckAt: string | null
  error: string | null
  unread: boolean
  threads: AssistantThread[]
  proposals: AssistantProposal[]
}

export interface AssistantMemory { content: string; revision: string; bytes: number; maxBytes: number }
