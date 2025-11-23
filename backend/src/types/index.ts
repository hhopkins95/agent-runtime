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
// Event Types
// ============================================================================

export type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from './events';


