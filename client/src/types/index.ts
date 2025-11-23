/**
 * Type definitions for Agent Service React Client
 *
 * This package re-exports shared types from @hhopkins/agent-runtime
 * and defines client-specific types for REST API and configuration.
 */

// ============================================================================
// Re-export Shared Types from Backend Runtime
// ============================================================================

import type {
  AGENT_ARCHITECTURE_TYPE,
  SessionStatus,
} from '@hhopkins/agent-runtime/types';

export type {
  // Session types
  AGENT_ARCHITECTURE_TYPE,
  SessionStatus,
  WorkspaceFile,
  SessionListData,
  RuntimeSessionData,
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

// ============================================================================
// REST API Request/Response Types
// ============================================================================

export interface CreateSessionRequest {
  agentProfileRef: string;
  architecture: AGENT_ARCHITECTURE_TYPE;
}

export interface CreateSessionResponse {
  sessionId: string;
  status: SessionStatus;
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
