/**
 * Event Bus - Centralized event infrastructure for domain events
 *
 * Provides type-safe event emission and listening for decoupling
 * business logic from transport layer (WebSocket, HTTP, etc.)
 *
 * Benefits:
 * - Type safety: All events are typed via DomainEvents interface
 * - Testability: Business logic can be tested without Socket.io
 * - Flexibility: Easy to add new transport layers
 * - Debugging: Single place to log all events
 */

import { EventEmitter } from 'events';
import type { WorkspaceFile, SessionRuntimeState } from '../types/session/index.js';
import type { ConversationBlock } from '../types/session/blocks.js';

/**
 * Domain events emitted by business logic
 *
 * ALL events must be defined here for type safety.
 * Add new events as needed following the naming convention:
 * - resource:scope:action (e.g., session:file:created)
 */
export interface DomainEvents {
  // ============================================================================
  // Session Lifecycle Events
  // ============================================================================

  /**
   * Session runtime status changed (unified event for all status updates)
   * Replaces: session:created, session:loaded, session:destroyed, sandbox:status
   * Emitted by: AgentSession, SessionManager
   */
  'session:status': {
    sessionId: string;
    runtime: SessionRuntimeState;
  };

  /**
   * Sessions list changed (trigger broadcast)
   * Emitted by: SessionManager after create/load/unload
   */
  'sessions:changed': void;

  // ============================================================================
  // Block Streaming Events
  // ============================================================================

  /**
   * New block started in conversation
   * Emitted by: AgentSession.sendMessage()
   */
  'session:block:start': {
    sessionId: string;
    conversationId: 'main' | string; // 'main' or subagentId
    block: ConversationBlock;
  };

  /**
   * Text delta for streaming block content
   * Emitted by: AgentSession.sendMessage()
   */
  'session:block:delta': {
    sessionId: string;
    conversationId: 'main' | string;
    blockId: string;
    delta: string;
  };

  /**
   * Block metadata/status updated
   * Emitted by: AgentSession.sendMessage()
   */
  'session:block:update': {
    sessionId: string;
    conversationId: 'main' | string;
    blockId: string;
    updates: Partial<ConversationBlock>;
  };

  /**
   * Block completed and finalized
   * Emitted by: AgentSession.sendMessage()
   */
  'session:block:complete': {
    sessionId: string;
    conversationId: 'main' | string;
    blockId: string;
    block: ConversationBlock;
  };

  /**
   * Session metadata updated (tokens, cost, etc.)
   * Emitted by: AgentSession.sendMessage()
   */
  'session:metadata:update': {
    sessionId: string;
    conversationId: 'main' | string;
    metadata: {
      usage?: {
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
        thinkingTokens?: number;
        totalTokens: number;
      };
      costUSD?: number;
      model?: string;
      [key: string]: unknown;
    };
  };

  // ============================================================================
  // Subagent Events
  // ============================================================================

  /**
   * New subagent discovered
   * Emitted by: AgentSession (file watcher)
   */
  'session:subagent:discovered': {
    sessionId: string;
    subagent: { id: string; blocks: ConversationBlock[] };
  };

  /**
   * Subagent task completed
   * Emitted by: AgentSession (file watcher)
   */
  'session:subagent:completed': {
    sessionId: string;
    subagentId: string;
    status: 'completed' | 'failed';
  };

  /**
   * Subagent transcript changed
   * Emitted by: AgentSession (transcript watcher)
   */
  'session:subagent:changed': {
    sessionId: string;
    subagentId: string;
    content: string;
  };

  // ============================================================================
  // File Events
  // ============================================================================

  /**
   * File created in workspace
   * Emitted by: AgentSession (file watcher)
   */
  'session:file:created': {
    sessionId: string;
    file: WorkspaceFile;
  };

  /**
   * File modified in workspace
   * Emitted by: AgentSession (file watcher)
   */
  'session:file:modified': {
    sessionId: string;
    file: WorkspaceFile;
  };

  /**
   * File deleted from workspace
   * Emitted by: AgentSession (file watcher)
   */
  'session:file:deleted': {
    sessionId: string;
    path: string;
  };

  /**
   * Transcript file changed (internal event for session state updates)
   * Emitted by: AgentSandbox (transcript watcher)
   */
  'session:transcript:changed': {
    sessionId: string;
    content: string;
    path: string;
  };

  // ============================================================================
  // Error Events
  // ============================================================================

  /**
   * Error occurred during session operation
   * Emitted by: AgentSession.sendMessage()
   */
  'session:error': {
    sessionId: string;
    error: {
      message: string;
      code?: string;
    };
  };
}

/**
 * Type-safe EventBus for domain events
 *
 * Usage:
 * ```typescript
 * const eventBus = new EventBus();
 *
 * // Emit event (type-safe)
 * eventBus.emit('session:created', { sessionId, metadata });
 *
 * // Listen to event (type-safe callback)
 * eventBus.on('session:created', (data) => {
 *   console.log(data.sessionId); // TypeScript knows this exists
 * });
 * ```
 */
export class EventBus extends EventEmitter {
  /**
   * Emit type-safe domain event
   *
   * @param event - Event name (must be key of DomainEvents)
   * @param args - Event data (typed based on event)
   * @returns true if the event had listeners, false otherwise
   */
  override emit<K extends keyof DomainEvents>(
    event: K,
    ...args: DomainEvents[K] extends void ? [] : [DomainEvents[K]]
  ): boolean {
    return super.emit(event, ...args);
  }

  /**
   * Listen to type-safe domain event
   *
   * @param event - Event name (must be key of DomainEvents)
   * @param listener - Typed callback function
   * @returns this (for chaining)
   */
  override on<K extends keyof DomainEvents>(
    event: K,
    listener: DomainEvents[K] extends void ? () => void : (data: DomainEvents[K]) => void
  ): this {
    return super.on(event, listener);
  }

  /**
   * Listen once to type-safe domain event
   *
   * @param event - Event name (must be key of DomainEvents)
   * @param listener - Typed callback function
   * @returns this (for chaining)
   */
  override once<K extends keyof DomainEvents>(
    event: K,
    listener: DomainEvents[K] extends void ? () => void : (data: DomainEvents[K]) => void
  ): this {
    return super.once(event, listener);
  }

  /**
   * Remove type-safe event listener
   *
   * @param event - Event name (must be key of DomainEvents)
   * @param listener - Callback function to remove
   * @returns this (for chaining)
   */
  override off<K extends keyof DomainEvents>(
    event: K,
    listener: DomainEvents[K] extends void ? () => void : (data: DomainEvents[K]) => void
  ): this {
    return super.off(event, listener);
  }

  /**
   * Remove all listeners for an event, or all listeners if no event specified
   *
   * @param event - Optional event name
   * @returns this (for chaining)
   */
  override removeAllListeners(event?: keyof DomainEvents): this {
    return super.removeAllListeners(event);
  }
}
