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
  SessionStatus,
  WorkspaceFile,
  SessionListData,
  RuntimeSessionData,
} from './session';

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


