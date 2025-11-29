/**
 * WebSocket Manager for Agent Service
 *
 * Manages Socket.io connection and provides typed event handlers.
 * Handles auto-reconnection and room management.
 */

import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '../types';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type WebSocketEventHandler<T> = (data: T) => void;

export class WebSocketManager {
  private socket: TypedSocket | null = null;
  private wsUrl: string;
  private debug: boolean;
  // Reference counting for session rooms - only leave when all consumers release
  private sessionRefCounts = new Map<string, number>();

  constructor(wsUrl: string, debug = false) {
    this.wsUrl = wsUrl;
    this.debug = debug;
  }

  /**
   * Connect to the WebSocket server
   */
  connect(): void {
    if (this.socket?.connected) {
      if (this.debug) {
        console.log('[WebSocket] Already connected');
      }
      return;
    }

    if (this.debug) {
      console.log('[WebSocket] Connecting to', this.wsUrl);
    }

    this.socket = io(this.wsUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    // Connection event handlers
    this.socket.on('connect', () => {
      if (this.debug) {
        console.log('[WebSocket] Connected');
      }

      // Rejoin all sessions that have active consumers (ref count > 0)
      this.sessionRefCounts.forEach((count, sessionId) => {
        if (count > 0) {
          if (this.debug) {
            console.log('[WebSocket] Rejoining session after reconnect:', sessionId, 'refCount:', count);
          }
          // Directly emit without going through joinSession to avoid incrementing ref count
          this.socket?.emit('session:join', sessionId, (response) => {
            if (!response.success && this.debug) {
              console.error('[WebSocket] Failed to rejoin session:', sessionId, response.error);
            }
          });
        }
      });
    });

    this.socket.on('disconnect', (reason) => {
      if (this.debug) {
        console.log('[WebSocket] Disconnected:', reason);
      }
    });

    this.socket.on('connect_error', (error) => {
      if (this.debug) {
        console.error('[WebSocket] Connection error:', error);
      }
    });
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
      if (this.debug) {
        console.log('[WebSocket] Disconnecting');
      }
      this.socket.disconnect();
      this.socket = null;
      this.sessionRefCounts.clear();
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /**
   * Join a session room to receive its updates
   * Uses reference counting - only actually joins on first consumer
   */
  joinSession(sessionId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }

      const currentCount = this.sessionRefCounts.get(sessionId) ?? 0;

      // Already joined by another consumer - just increment ref count
      if (currentCount > 0) {
        this.sessionRefCounts.set(sessionId, currentCount + 1);
        if (this.debug) {
          console.log('[WebSocket] Session already joined, incrementing ref count:', sessionId, 'count:', currentCount + 1);
        }
        resolve();
        return;
      }

      // First consumer - actually join the room
      if (this.debug) {
        console.log('[WebSocket] Joining session:', sessionId);
      }

      this.socket.emit('session:join', sessionId, (response) => {
        if (response.success) {
          this.sessionRefCounts.set(sessionId, 1);
          if (this.debug) {
            console.log('[WebSocket] Joined session, ref count:', sessionId, 'count: 1');
          }
          resolve();
        } else {
          reject(new Error(response.error || 'Failed to join session'));
        }
      });
    });
  }

  /**
   * Leave a session room
   * Uses reference counting - only actually leaves when last consumer releases
   */
  leaveSession(sessionId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }

      const currentCount = this.sessionRefCounts.get(sessionId) ?? 0;

      // Not joined - no-op
      if (currentCount <= 0) {
        if (this.debug) {
          console.log('[WebSocket] Not joined to session (ref count 0):', sessionId);
        }
        resolve();
        return;
      }

      // Other consumers still need this room - just decrement ref count
      if (currentCount > 1) {
        this.sessionRefCounts.set(sessionId, currentCount - 1);
        if (this.debug) {
          console.log('[WebSocket] Decremented ref count, still joined:', sessionId, 'count:', currentCount - 1);
        }
        resolve();
        return;
      }

      // Last consumer - actually leave the room
      if (this.debug) {
        console.log('[WebSocket] Leaving session (last consumer):', sessionId);
      }

      this.socket.emit('session:leave', sessionId, (response) => {
        if (response.success) {
          this.sessionRefCounts.delete(sessionId);
          if (this.debug) {
            console.log('[WebSocket] Left session, removed from ref counts:', sessionId);
          }
          resolve();
        } else {
          reject(new Error('Failed to leave session'));
        }
      });
    });
  }

  // ==========================================================================
  // Event Listeners
  // ==========================================================================

  /**
   * Register an event listener
   */
  on<K extends keyof ServerToClientEvents>(
    event: K,
    handler: ServerToClientEvents[K]
  ): void {
    if (!this.socket) {
      console.warn('[WebSocket] Cannot register listener: not connected');
      return;
    }

    this.socket.on(event, handler as any);
  }

  /**
   * Unregister an event listener
   */
  off<K extends keyof ServerToClientEvents>(
    event: K,
    handler: ServerToClientEvents[K]
  ): void {
    if (!this.socket) {
      return;
    }

    this.socket.off(event, handler as any);
  }

  /**
   * Register a one-time event listener
   */
  once<K extends keyof ServerToClientEvents>(
    event: K,
    handler: ServerToClientEvents[K]
  ): void {
    if (!this.socket) {
      console.warn('[WebSocket] Cannot register listener: not connected');
      return;
    }

    this.socket.once(event, handler as any);
  }

  /**
   * Remove all listeners for an event
   */
  removeAllListeners<K extends keyof ServerToClientEvents>(event?: K): void {
    if (!this.socket) {
      return;
    }

    if (event) {
      this.socket.removeAllListeners(event);
    } else {
      this.socket.removeAllListeners();
    }
  }
}
