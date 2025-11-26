/**
 *  Generic Agent Runtime - Public API
 *
 * This is the public API for the generic agent runtime.
 * Applications import from this module to use the runtime with their own adapters.
 *
 * @example
 * ```typescript
 * import { createAgentRuntime } from './src';
 * import type { RuntimeConfig, AgentRuntime } from './src';
 *
 * const runtime = await createAgentRuntime({
 *   persistence: new MyPersistenceAdapter(),
 *   profileLoader: new MyProfileLoader(),
 *   sandboxConfig: new MySandboxConfig(),
 * 
 *   modal: { ... },
 * });
 * ```
 */

// ============================================================================
// Runtime Factory
// ============================================================================

export { createAgentRuntime } from './runtime.js';

// ============================================================================
// Core Types
// ============================================================================

export type {
  // Runtime configuration
  RuntimeConfig,

  // Adapter interfaces
  PersistenceAdapter,
  
  // Session types
  SessionListData,
  SavedSessionData,
  RuntimeSessionData,
  WorkspaceFile,
  AGENT_ARCHITECTURE_TYPE,
  SessionStatus,

  // Agent profile types
  AgentProfile,
  AgentProfileListData,

  // Block types
  ConversationBlock,

  // Event types
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,

} from './types/index.js';

// ============================================================================
// Core Components (for advanced use cases)
// ============================================================================

export { EventBus } from './core/event-bus.js';
export { SessionManager } from './core/session-manager.js';
export type { AgentSession } from './core/agent-session.js';

// ============================================================================
// Transport Layer (REST & WebSocket)
// ============================================================================

export { createRestServer, errorResponse } from './transport/rest/server.js';
export { createSessionRoutes } from './transport/rest/routes/sessions.js';
export { createMessageRoutes } from './transport/rest/routes/messages.js';
