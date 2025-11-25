/**
 * Session Lifecycle Handlers
 *
 * WebSocket handlers for joining and leaving session rooms
 */

import type { Socket } from 'socket.io';
import type { SessionManager } from '../../../core/session-manager.js';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from '../../../types/events.js';
import { logger } from '../../../config/logger.js';
import { getErrorMessage } from './utils.js';

/**
 * Properly typed Socket with custom event interfaces
 */
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

/**
 * Setup session lifecycle event handlers on a socket
 */
export function setupSessionLifecycleHandlers(
  socket: TypedSocket,
  sessionManager: SessionManager
): void {
  /**
   * Join session room to receive updates
   */
  socket.on('session:join', (sessionId, callback) => {
    try {
      logger.info({ socketId: socket.id, sessionId }, 'Client joining session room');

      // Validate session exists
      const session = sessionManager.getSession(sessionId);
      if (!session) {
        logger.warn({ socketId: socket.id, sessionId }, 'Session not active');
        callback({ success: false, error: 'Session not active' });
        return;
      }

      // Join Socket.io room
      socket.join(`session:${sessionId}`);
      socket.data.sessionId = sessionId;

      // Send current status immediately so client has correct state
      const state = session.getState();
      socket.emit('session:status', {
        sessionId,
        status: state.status,
      });

      logger.info(
        {
          socketId: socket.id,
          sessionId,
          status: state.status,
        },
        'Client joined session room'
      );

      callback({ success: true });
    } catch (error) {
      logger.error({ error, socketId: socket.id, sessionId }, 'Failed to join session');
      callback({
        success: false,
        error: getErrorMessage(error),
      });
    }
  });

  /**
   * Leave session room
   */
  socket.on('session:leave', (sessionId, callback) => {
    try {
      logger.info({ socketId: socket.id, sessionId }, 'Client leaving session room');

      socket.leave(`session:${sessionId}`);
      socket.data.sessionId = undefined;

      logger.info(
        {
          socketId: socket.id,
          sessionId,
        },
        'Client left session room'
      );

      callback({ success: true });
    } catch (error) {
      logger.error({ error, socketId: socket.id, sessionId }, 'Failed to leave session');
      callback({ success: true }); // Always return success for leave
    }
  });
}
