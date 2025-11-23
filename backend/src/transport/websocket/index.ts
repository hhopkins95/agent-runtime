/**
 * WebSocket Server - Socket.io setup with EventBus architecture
 *
 * Provides real-time event streaming between server and clients via WebSocket.
 * Mutations are handled via REST API, WebSocket is for subscription and streaming only.
 *
 * Architecture:
 * - Business logic emits domain events → EventBus
 * - event-listeners.ts translates EventBus → Socket.io (granular events)
 * - handlers/ handle session room join/leave operations
 */

import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import type { SessionManager } from '../../core/session-manager.js';
import type { EventBus } from '../../core/event-bus.js';
import { logger } from '../../config/logger.js';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from '../../types/events.js';
import { setupEventListeners } from './event-listeners.js';
import { setupSessionLifecycleHandlers } from './handlers/session-lifecycle.js';

/**
 * Create and configure WebSocket server with EventBus architecture
 *
 * @param httpServer - HTTP server instance to attach Socket.io to
 * @param sessionManager - SessionManager instance
 * @param eventBus - EventBus instance for domain events
 * @returns Configured Socket.io server
 */
export function createWebSocketServer(
  httpServer: HTTPServer,
  sessionManager: SessionManager,
  eventBus: EventBus
): SocketIOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData> {
 
 
 
  // Create Socket.io server
  const io = new SocketIOServer<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: {
      origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'],
      credentials: true,
    },
    path: '/socket.io',
  });

  logger.info('Initializing WebSocket server (EventBus architecture)...');

  // ==========================================================================
  // Setup Domain Event Listeners (EventBus → Socket.io)
  // ==========================================================================

  setupEventListeners(io, sessionManager, eventBus);

  // ==========================================================================
  // Connection Handler (Socket.io → Business Logic)
  // ==========================================================================

  io.on('connection', (socket) => {
    logger.info(
      {
        socketId: socket.id,
        transport: socket.conn.transport.name,
      },
      'Client connected to WebSocket'
    );

    // Store connection metadata
    socket.data.joinedAt = Date.now();

    // Setup socket event handlers
    setupSessionLifecycleHandlers(socket, sessionManager);

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      logger.info(
        {
          socketId: socket.id,
          sessionId: socket.data.sessionId,
          reason,
        },
        'Client disconnected from WebSocket'
      );

      // Cleanup handled by Socket.io (socket leaves all rooms automatically)
      if (socket.data.sessionId) {
        logger.debug(
          {
            sessionId: socket.data.sessionId,
          },
          'Client disconnected from session'
        );
      }
    });
  });

  logger.info('WebSocket server initialized successfully (EventBus architecture)');

  return io;
}
