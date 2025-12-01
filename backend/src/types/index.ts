/**
 * Public type exports for the generic agent runtime
 *
 * Applications importing this runtime should use these types
 * to implement adapters and configure the runtime.
 */

// ============================================================================
// Core Adapter Interfaces
// ============================================================================

export type {
  // Persistence (session + storage combined)
  PersistenceAdapter,
} from './persistence-adapter';

// ============================================================================
// Runtime Configuration
// ============================================================================

export type {
  RuntimeConfig,
} from './runtime';

// ============================================================================
// Session Types
// ============================================================================

export type {
  AGENT_ARCHITECTURE_TYPE,
  WorkspaceFile,
  RuntimeSessionData,
  // New types (preferred)
  SandboxStatus,
  SessionRuntimeState,
  SessionListItem,
  PersistedSessionListData,
  CreateSessionArgs,
  PersistedSessionData
} from './session';

// ============================================================================
// Agent Profile Types
// ============================================================================

export type {
  AgentProfileListData,
  AgentProfile,
} from './agent-profiles';

// ============================================================================
// Block Types (Conversation Elements)
// ============================================================================

export type {
  // Content types
  TextContent,
  ImageContent,
  ContentPart,
  MessageContent,
  // Tool execution
  ToolExecutionStatus,
  ToolIO,
  // Base block
  BaseBlock,
  // Block types
  UserMessageBlock,
  AssistantTextBlock,
  ToolUseBlock,
  ToolResultBlock,
  ThinkingBlock,
  SystemBlock,
  SubagentStatus,
  SubagentBlock,
  ErrorBlock,
  // Union type
  ConversationBlock,
} from './session/blocks';

// Export type guards
export {
  isUserMessageBlock,
  isAssistantTextBlock,
  isToolUseBlock,
  isToolResultBlock,
  isThinkingBlock,
  isSystemBlock,
  isSubagentBlock,
  isErrorBlock,
} from './session/blocks';

// ============================================================================
// Event Types (WebSocket)
// ============================================================================

export type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from './events';

// ============================================================================
// Session Options Types
// ============================================================================

export type {
  AgentArchitectureSessionOptions,
  ClaudeSDKSessionOptions,
  OpenCodeSessionOptions,
} from '../lib/agent-architectures/base';


