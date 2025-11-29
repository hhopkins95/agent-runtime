/**
 * Agent Service React Client
 *
 * React hooks and client for interacting with agent-service instances.
 *
 * @example
 * ```tsx
 * import { AgentServiceProvider, useAgentSession, useMessages } from '@agent-service/react-client';
 *
 * function App() {
 *   return (
 *     <AgentServiceProvider
 *       apiUrl="http://localhost:3002"
 *       wsUrl="http://localhost:3003"
 *       apiKey="your-api-key"
 *     >
 *       <ChatInterface />
 *     </AgentServiceProvider>
 *   );
 * }
 * ```
 */

// Provider & Context
export { AgentServiceProvider } from './context/AgentServiceProvider';
export { AgentServiceContext } from './context/AgentServiceContext';
export type { AgentServiceContextValue } from './context/AgentServiceContext';

// Hooks
export { useSessionList } from './hooks/useSessionList';
export { useAgentSession } from './hooks/useAgentSession';
export { useMessages } from './hooks/useMessages';
export { useWorkspaceFiles } from './hooks/useWorkspaceFiles';
export { useSubagents } from './hooks/useSubagents';
export { useEvents } from './hooks/useEvents';

export type { UseSessionListResult } from './hooks/useSessionList';
export type { UseAgentSessionResult } from './hooks/useAgentSession';
export type { UseMessagesResult } from './hooks/useMessages';
export type { UseWorkspaceFilesResult } from './hooks/useWorkspaceFiles';
export type { UseSubagentsResult, SubagentInfo } from './hooks/useSubagents';
export type { UseEventsResult } from './hooks/useEvents';

// Client Classes (for advanced usage)
export { RestClient } from './client/rest';
export { WebSocketManager } from './client/websocket';

// State Management (for advanced usage)
export { agentServiceReducer, initialState } from './context/reducer';
export type {
  AgentServiceState,
  AgentServiceAction,
  SessionState,
  DebugEvent,
} from './context/reducer';

// Types
export type {
  // Architecture & Session (new)
  AGENT_ARCHITECTURE_TYPE,
  SessionListItem,
  SessionRuntimeState,
  SandboxStatus,
  RuntimeSessionData,
  WorkspaceFile,
  StreamingBlock,
  SubagentState,

  // Session Options
  AgentArchitectureSessionOptions,
  ClaudeSDKSessionOptions,
  OpenCodeSessionOptions,

  // Architecture & Session (deprecated)
  SessionStatus,
  SessionListData,

  // Content Types
  TextContent,
  ImageContent,
  ContentPart,
  MessageContent,

  // Block Types
  ConversationBlock,
  UserMessageBlock,
  AssistantTextBlock,
  ToolUseBlock,
  ToolResultBlock,
  ThinkingBlock,
  SystemBlock,
  SubagentBlock,
  BaseBlock,

  // Status Types
  ToolExecutionStatus,
  SubagentStatus,

  // Metadata
  SessionMetadata,
  TokenUsage,

  // WebSocket Events
  ServerToClientEvents,
  ClientToServerEvents,

  // API Types
  CreateSessionRequest,
  CreateSessionResponse,
  SendMessageRequest,
  SendMessageResponse,
  ApiError,

  // Config
  AgentServiceConfig,
} from './types';

// Type Guards
export {
  isUserMessageBlock,
  isAssistantTextBlock,
  isToolUseBlock,
  isToolResultBlock,
  isThinkingBlock,
  isSystemBlock,
  isSubagentBlock,
} from './types';
