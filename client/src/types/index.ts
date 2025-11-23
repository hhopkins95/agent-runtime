/**
 * Type definitions for Agent Service React Client
 *
 * ⚠️  IMPORTANT: These types are duplicated from ../../../src/types/
 *
 * We duplicate instead of import because:
 * - TypeScript can't import types outside rootDir without including all backend code
 * - The client package needs to be standalone and publishable
 * - When extracted to a separate repo, these will be the canonical types
 *
 * TO KEEP IN SYNC:
 * - Session types: Match ../../../src/types/session/index.ts
 * - Block types: Match ../../../src/types/session/blocks.ts
 * - Event types: Match ../../../src/types/events.ts
 *
 * When the agent-service is extracted to its own repo, consider publishing
 * a separate @agent-service/types package that both client and server import.
 */

// ============================================================================
// Agent Architecture & Session Types
// Source: ../../../src/types/session/index.ts
// ============================================================================

export type AGENT_ARCHITECTURE_TYPE = "claude-agent-sdk" | "gemini-cli";

export type SessionStatus =
  | "pending"
  | "active"
  | "inactive"
  | "completed"
  | "failed"
  | "building-sandbox";

/**
 * A file in the workspace during the session
 */
export interface WorkspaceFile {
  path: string;
  content: string;
}

/**
 * Minimal session data for listings
 */
export interface SessionListData {
  sessionId: string;
  type: AGENT_ARCHITECTURE_TYPE;
  agentProfileReference: string;
  name?: string;
  status: SessionStatus;
  lastActivity?: number;
  createdAt?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Complete session data including conversation and files
 */
export interface RuntimeSessionData extends SessionListData {
  blocks: ConversationBlock[];
  workspaceFiles: WorkspaceFile[];
  rawTranscript?: string;
  subagents: {
    id: string;
    rawTranscript?: string;
    blocks: ConversationBlock[];
  }[];
}

// ============================================================================
// Content Types
// Source: ../../../src/types/session/blocks.ts
// ============================================================================

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ImageContent {
  type: 'image';
  source: {
    type: 'base64' | 'url';
    data: string;
    mediaType?: string;
  };
}

export type ContentPart = TextContent | ImageContent;
export type MessageContent = string | ContentPart[];

// ============================================================================
// Tool Execution Types
// Source: ../../../src/types/session/blocks.ts
// ============================================================================

export type ToolExecutionStatus = 'pending' | 'running' | 'success' | 'error';

export type SubagentStatus = 'pending' | 'running' | 'success' | 'error';

// ============================================================================
// Conversation Block Types
// Source: ../../../src/types/session/blocks.ts
// ============================================================================

export interface BaseBlock {
  id: string;
  timestamp: string;
}

export interface UserMessageBlock extends BaseBlock {
  type: 'user_message';
  content: MessageContent;
}

export interface AssistantTextBlock extends BaseBlock {
  type: 'assistant_text';
  content: string;
  model?: string;
}

export interface ToolUseBlock extends BaseBlock {
  type: 'tool_use';
  toolName: string;
  toolUseId: string;
  input: Record<string, unknown>;
  status: ToolExecutionStatus;
  displayName?: string;
  description?: string;
}

export interface ToolResultBlock extends BaseBlock {
  type: 'tool_result';
  toolUseId: string;
  output: unknown;
  isError: boolean;
  durationMs?: number;
  renderOutputAsMarkdown?: boolean;
}

export interface ThinkingBlock extends BaseBlock {
  type: 'thinking';
  content: string;
  summary?: string;
}

export interface SystemBlock extends BaseBlock {
  type: 'system';
  subtype:
    | 'session_start'
    | 'session_end'
    | 'error'
    | 'status'
    | 'hook_response'
    | 'auth_status';
  message: string;
  metadata?: Record<string, unknown>;
}

export interface SubagentBlock extends BaseBlock {
  type: 'subagent';
  subagentId: string;
  name?: string;
  input: string;
  status: SubagentStatus;
  output?: string;
  durationMs?: number;
  toolUseId?: string;
}

export type ConversationBlock =
  | UserMessageBlock
  | AssistantTextBlock
  | ToolUseBlock
  | ToolResultBlock
  | ThinkingBlock
  | SystemBlock
  | SubagentBlock;

// ============================================================================
// Type Guards
// Source: ../../../src/types/session/blocks.ts
// ============================================================================

export function isUserMessageBlock(block: ConversationBlock): block is UserMessageBlock {
  return block.type === 'user_message';
}

export function isAssistantTextBlock(block: ConversationBlock): block is AssistantTextBlock {
  return block.type === 'assistant_text';
}

export function isToolUseBlock(block: ConversationBlock): block is ToolUseBlock {
  return block.type === 'tool_use';
}

export function isToolResultBlock(block: ConversationBlock): block is ToolResultBlock {
  return block.type === 'tool_result';
}

export function isThinkingBlock(block: ConversationBlock): block is ThinkingBlock {
  return block.type === 'thinking';
}

export function isSystemBlock(block: ConversationBlock): block is SystemBlock {
  return block.type === 'system';
}

export function isSubagentBlock(block: ConversationBlock): block is SubagentBlock {
  return block.type === 'subagent';
}

// ============================================================================
// WebSocket Event Types
// Source: ../../../src/types/events.ts
// ============================================================================

export interface ServerToClientEvents {
  'sessions:list': (sessions: SessionListData[]) => void;

  'session:block:start': (data: {
    sessionId: string;
    conversationId: 'main' | string;
    block: ConversationBlock;
  }) => void;

  'session:block:delta': (data: {
    sessionId: string;
    conversationId: 'main' | string;
    blockId: string;
    delta: string;
  }) => void;

  'session:block:update': (data: {
    sessionId: string;
    conversationId: 'main' | string;
    blockId: string;
    updates: Partial<ConversationBlock>;
  }) => void;

  'session:block:complete': (data: {
    sessionId: string;
    conversationId: 'main' | string;
    blockId: string;
    block: ConversationBlock;
  }) => void;

  'session:metadata:update': (data: {
    sessionId: string;
    conversationId: 'main' | string;
    metadata: SessionMetadata;
  }) => void;

  'session:subagent:discovered': (data: {
    sessionId: string;
    subagent: {
      id: string;
      blocks: ConversationBlock[];
    };
  }) => void;

  'session:subagent:completed': (data: {
    sessionId: string;
    subagentId: string;
    status: 'completed' | 'failed';
  }) => void;

  'session:file:created': (data: {
    sessionId: string;
    file: WorkspaceFile;
  }) => void;

  'session:file:modified': (data: {
    sessionId: string;
    file: WorkspaceFile;
  }) => void;

  'session:file:deleted': (data: {
    sessionId: string;
    path: string;
  }) => void;

  'session:status': (data: {
    sessionId: string;
    status: 'active' | 'inactive';
  }) => void;

  'sandbox:status': (data: {
    sessionId: string;
    sandboxId: string;
    status: 'healthy' | 'unhealthy' | 'terminated';
  }) => void;

  'session:idle:warning': (data: {
    sessionId: string;
    timeRemaining: number;
  }) => void;

  'error': (error: {
    message: string;
    code?: string;
    sessionId?: string;
  }) => void;
}

export interface ClientToServerEvents {
  'session:join': (
    sessionId: string,
    callback: (response: { success: boolean; error?: string }) => void
  ) => void;

  'session:leave': (
    sessionId: string,
    callback: (response: { success: boolean }) => void
  ) => void;
}

// ============================================================================
// Client-Specific Types (not in backend)
// ============================================================================

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  thinkingTokens?: number;
  totalTokens: number;
}

export interface SessionMetadata {
  usage?: TokenUsage;
  costUSD?: number;
  model?: string;
  [key: string]: unknown;
}

// REST API Request/Response Types
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

// Client Configuration
export interface AgentServiceConfig {
  apiUrl: string;
  wsUrl: string;
  apiKey: string;
  debug?: boolean;
}
