/**
 * Type definitions for Agent Service React Client
 *
 * This package re-exports shared types from @hhopkins/agent-runtime
 * and defines client-specific types for REST API and configuration.
 */

// ============================================================================
// Re-export Shared Types from Backend Runtime
// ============================================================================

export type {
  // Session types (new)
  AGENT_ARCHITECTURE_TYPE,
  WorkspaceFile,
  RuntimeSessionData,
  SandboxStatus,
  SessionRuntimeState,
  SessionListItem,
  // Session types (deprecated - use SessionListItem instead)
  SessionStatus,
  SessionListData,
  // Block types
  TextContent,
  ImageContent,
  ContentPart,
  MessageContent,
  ToolExecutionStatus,
  BaseBlock,
  UserMessageBlock,
  AssistantTextBlock,
  ToolUseBlock,
  ToolResultBlock,
  ThinkingBlock,
  SystemBlock,
  SubagentStatus,
  SubagentBlock,
  ConversationBlock,
  // WebSocket event types
  ServerToClientEvents,
  ClientToServerEvents,
} from '@hhopkins/agent-runtime/types';

// Export type guards
export {
  isUserMessageBlock,
  isAssistantTextBlock,
  isToolUseBlock,
  isToolResultBlock,
  isThinkingBlock,
  isSystemBlock,
  isSubagentBlock,
} from '@hhopkins/agent-runtime/types';

// ============================================================================
// Client-Specific Types
// ============================================================================

/**
 * Token usage tracking for session cost estimation
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  thinkingTokens?: number;
  totalTokens: number;
}

/**
 * Session metadata including usage and cost information
 */
export interface SessionMetadata {
  usage?: TokenUsage;
  costUSD?: number;
  model?: string;
  [key: string]: unknown;
}

/**
 * Streaming content state for in-progress text
 * Keyed by conversationId - accumulates all deltas for a conversation
 * until block_complete arrives with finalized content
 */
export interface StreamingContent {
  /** Which conversation this belongs to ('main' or subagentId) */
  conversationId: 'main' | string;
  /** Accumulated content from deltas */
  content: string;
  /** When streaming started */
  startedAt: number;
}

/**
 * @deprecated Use StreamingContent instead - now keyed by conversationId
 */
export type StreamingBlock = StreamingContent;

/**
 * Subagent state including blocks and status
 */
export interface SubagentState {
  id: string;
  blocks: import('@hhopkins/agent-runtime/types').ConversationBlock[];
  status: 'running' | 'completed' | 'failed';
  metadata: SessionMetadata;
}

// ============================================================================
// REST API Request/Response Types
// ============================================================================

export interface CreateSessionRequest {
  agentProfileRef: string;
  architecture: import('@hhopkins/agent-runtime/types').AGENT_ARCHITECTURE_TYPE;
}

export interface CreateSessionResponse {
  sessionId: string;
  runtime: import('@hhopkins/agent-runtime/types').SessionRuntimeState;
  createdAt: number;
}

export interface SendMessageRequest {
  content: string;
}

export interface SendMessageResponse {
  success: boolean;
  sessionId: string;
}

export interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
}

// ============================================================================
// Client Configuration
// ============================================================================

export interface AgentServiceConfig {
  apiUrl: string;
  wsUrl: string;
  apiKey: string;
  debug?: boolean;
}
