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
import type { ServerToClientEvents } from '../types/events.js';

/**
 * Extract payload type from WebSocket event function signature
 * e.g., (data: { sessionId: string }) => void  →  { sessionId: string }
 */
type EventPayload<T> = T extends (data: infer P) => void ? P : never;

/**
 * Domain events emitted by business logic
 *
 * Events shared with WebSocket clients are derived from ServerToClientEvents.
 * Internal-only events are defined directly here.
 */
export interface DomainEvents {
  // ============================================================================
  // Events derived from ServerToClientEvents (single source of truth)
  // ============================================================================

  'session:status': EventPayload<ServerToClientEvents['session:status']>;
  'session:block:start': EventPayload<ServerToClientEvents['session:block:start']>;
  'session:block:delta': EventPayload<ServerToClientEvents['session:block:delta']>;
  'session:block:update': EventPayload<ServerToClientEvents['session:block:update']>;
  'session:block:complete': EventPayload<ServerToClientEvents['session:block:complete']>;
  'session:metadata:update': EventPayload<ServerToClientEvents['session:metadata:update']>;
  'session:options:update': EventPayload<ServerToClientEvents['session:options:update']>;
  'session:subagent:discovered': EventPayload<ServerToClientEvents['session:subagent:discovered']>;
  'session:subagent:completed': EventPayload<ServerToClientEvents['session:subagent:completed']>;
  'session:file:created': EventPayload<ServerToClientEvents['session:file:created']>;
  'session:file:modified': EventPayload<ServerToClientEvents['session:file:modified']>;
  'session:file:deleted': EventPayload<ServerToClientEvents['session:file:deleted']>;

  // ============================================================================
  // Internal-only events (not exposed via WebSocket)
  // ============================================================================

  /** Sessions list changed - triggers broadcast of sessions:list */
  'sessions:changed': void;

  /** Transcript changed (for session state sync) */
  'session:transcript:changed': {
    sessionId: string;
    content: string;
  };

  /** Subagent transcript changed */
  'session:subagent:changed': {
    sessionId: string;
    subagentId: string;
    content: string;
  };

  /** Session error - transformed to 'error' event for WebSocket */
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
