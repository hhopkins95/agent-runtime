/**
 * Event Bus to WebSocket Bridge
 *
 * Listens to domain events from EventBus and translates them to Socket.io events.
 * This is the key layer that decouples business logic from transport.
 *
 * Architecture:
 * - AgentSession emits domain events → EventBus
 * - EventBus broadcasts to all listeners
 * - This module listens and translates to Socket.io
 * - Socket.io broadcasts to connected clients
 */

import type { Server as SocketIOServer } from 'socket.io';
import type { SessionManager } from '../../core/session-manager.js';
import type { EventBus } from '../../core/event-bus.js';
import { logger } from '../../config/logger.js';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from '../../types/events.js';

/**
 * Setup event listeners to bridge EventBus → Socket.io
 *
 * @param io - Socket.io server instance
 * @param sessionManager - SessionManager instance (for fetching sessions list)
 * @param eventBus - EventBus instance
 */
export function setupEventListeners(
  io: SocketIOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
  sessionManager: SessionManager,
  eventBus: EventBus
): void {
  logger.info('Setting up EventBus → WebSocket bridge...');

  // ==========================================================================
  // Session Lifecycle Events
  // ==========================================================================

  /**
   * Sessions list changed - broadcast to all clients
   */
  eventBus.on('sessions:changed', async () => {
    try {
      const sessions = await sessionManager.getAllSessions();
      io.emit('sessions:list', sessions);
      logger.debug({ sessionCount: sessions.length }, 'Broadcast sessions list');
    } catch (error) {
      logger.error({ error }, 'Failed to broadcast sessions list');
    }
  });

  /**
   * Session runtime status changed (unified event)
   * Covers: session loaded, sandbox starting/ready/terminated, session unloaded
   */
  eventBus.on('session:status', (data) => {
    io.to(`session:${data.sessionId}`).emit('session:status', {
      sessionId: data.sessionId,
      runtime: data.runtime,
    });
    logger.debug(
      {
        sessionId: data.sessionId,
        isLoaded: data.runtime.isLoaded,
        sandboxStatus: data.runtime.sandbox?.status ?? 'none',
      },
      'Broadcast session status'
    );
  });

  // ==========================================================================
  // Block Streaming Events
  // ==========================================================================

  /**
   * New block started in conversation (main or subagent)
   */
  eventBus.on('session:block:start', (data) => {
    io.to(`session:${data.sessionId}`).emit('session:block:start', {
      sessionId: data.sessionId,
      conversationId: data.conversationId,
      block: data.block,
    });
    logger.debug(
      {
        sessionId: data.sessionId,
        conversationId: data.conversationId,
        blockType: data.block.type,
        blockId: data.block.id,
      },
      'Broadcast block start'
    );
  });

  /**
   * Text delta for streaming block content
   */
  eventBus.on('session:block:delta', (data) => {
    io.to(`session:${data.sessionId}`).emit('session:block:delta', {
      sessionId: data.sessionId,
      conversationId: data.conversationId,
      blockId: data.blockId,
      delta: data.delta,
    });
    logger.debug(
      {
        sessionId: data.sessionId,
        conversationId: data.conversationId,
        blockId: data.blockId,
        deltaLength: data.delta.length,
      },
      'Broadcast block delta'
    );
  });

  /**
   * Block metadata/status updated
   */
  eventBus.on('session:block:update', (data) => {
    io.to(`session:${data.sessionId}`).emit('session:block:update', {
      sessionId: data.sessionId,
      conversationId: data.conversationId,
      blockId: data.blockId,
      updates: data.updates,
    });
    logger.debug(
      {
        sessionId: data.sessionId,
        conversationId: data.conversationId,
        blockId: data.blockId,
        updateFields: Object.keys(data.updates),
      },
      'Broadcast block update'
    );
  });

  /**
   * Block completed and finalized
   */
  eventBus.on('session:block:complete', (data) => {
    io.to(`session:${data.sessionId}`).emit('session:block:complete', {
      sessionId: data.sessionId,
      conversationId: data.conversationId,
      blockId: data.blockId,
      block: data.block,
    });
    logger.debug(
      {
        sessionId: data.sessionId,
        conversationId: data.conversationId,
        blockId: data.blockId,
        blockType: data.block.type,
      },
      'Broadcast block complete'
    );
  });

  /**
   * Session metadata updated (tokens, cost, etc.)
   */
  eventBus.on('session:metadata:update', (data) => {
    io.to(`session:${data.sessionId}`).emit('session:metadata:update', {
      sessionId: data.sessionId,
      conversationId: data.conversationId,
      metadata: data.metadata,
    });
    logger.debug(
      {
        sessionId: data.sessionId,
        conversationId: data.conversationId,
        metadataKeys: Object.keys(data.metadata),
      },
      'Broadcast metadata update'
    );
  });


  /**
   * Session options updated
   */
  eventBus.on('session:options:update', (data) => {
    io.to(`session:${data.sessionId}`).emit('session.options:update', {
      sessionId: data.sessionId,
      options: data.options,
    });
  });
  // ==========================================================================
  // Subagent Events
  // ==========================================================================

  /**
   * New subagent discovered
   */
  eventBus.on('session:subagent:discovered', (data) => {
    io.to(`session:${data.sessionId}`).emit('session:subagent:discovered', {
      sessionId: data.sessionId,
      subagent: data.subagent,
    });
    logger.debug(
      { sessionId: data.sessionId, subagentId: data.subagent.id },
      'Broadcast subagent discovered'
    );
  });

  /**
   * Subagent completed
   */
  eventBus.on('session:subagent:completed', (data) => {
    io.to(`session:${data.sessionId}`).emit('session:subagent:completed', {
      sessionId: data.sessionId,
      subagentId: data.subagentId,
      status: data.status,
    });
    logger.debug(
      { sessionId: data.sessionId, subagentId: data.subagentId, status: data.status },
      'Broadcast subagent completed'
    );
  });

  // ==========================================================================
  // File Events
  // ==========================================================================

  /**
   * File created in workspace
   */
  eventBus.on('session:file:created', (data) => {
    io.to(`session:${data.sessionId}`).emit('session:file:created', {
      sessionId: data.sessionId,
      file: data.file,
    });
    logger.debug({ sessionId: data.sessionId, path: data.file.path }, 'Broadcast file created');
  });

  /**
   * File modified in workspace
   */
  eventBus.on('session:file:modified', (data) => {
    const roomName = `session:${data.sessionId}`;
    const room = io.sockets.adapter.rooms.get(roomName);
    const socketCount = room?.size ?? 0;

    logger.info({
      sessionId: data.sessionId,
      path: data.file.path,
      room: roomName,
      socketCount
    }, 'Broadcasting file:modified event');

    io.to(roomName).emit('session:file:modified', {
      sessionId: data.sessionId,
      file: data.file,
    });
  });

  /**
   * File deleted from workspace
   */
  eventBus.on('session:file:deleted', (data) => {
    io.to(`session:${data.sessionId}`).emit('session:file:deleted', {
      sessionId: data.sessionId,
      path: data.path,
    });
    logger.debug({ sessionId: data.sessionId, path: data.path }, 'Broadcast file deleted');
  });

  // ==========================================================================
  // Error Events
  // ==========================================================================

  /**
   * Session error occurred
   */
  eventBus.on('session:error', (data) => {
    io.to(`session:${data.sessionId}`).emit('error', {
      message: data.error.message,
      code: data.error.code,
      sessionId: data.sessionId,
    });
    logger.error(
      { sessionId: data.sessionId, error: data.error.message },
      'Broadcast session error'
    );
  });

  logger.info('EventBus → WebSocket bridge setup complete (12 event listeners registered)');
}
