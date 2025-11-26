/**
 * Runtime factory - creates and configures the agent runtime
 *
 * This is the main entry point for applications using the generic runtime.
 * Applications provide their own adapter implementations and configuration.
 *
 * @example
 * ```typescript
 * import { serve } from "@hono/node-server";
 * import { createAgentRuntime } from './runtime';
 * 
 *
 * // Create and initialize runtime
 * const runtime = await createAgentRuntime({
 *   persistence: new MyPersistenceAdapter(),
 *   profileLoader: new MyProfileLoader(),
 *   sandboxConfig: new MySandboxConfig(),
 *   modal: {
 *     tokenId: process.env.MODAL_TOKEN_ID,
 *     tokenSecret: process.env.MODAL_TOKEN_SECRET,
 *     appName: 'my-app-agents',
 *   },
 * });
 *
 * await runtime.start();
 *
 * // Create Hono REST API
 * const honoApp = runtime.createRestServer({
 *   apiKey: process.env.API_KEY,
 * });
 *
 * // Create HTTP server from Hono
 * const httpServer = serve({
 *   fetch: honoApp.fetch,
 *   port: 3000,
 * });
 *
 * // Create WebSocket server on same HTTP server
 * const wsServer = runtime.createWebSocketServer(httpServer);
 *
 * console.log('Server running on http://localhost:3000');
 * ```
 */

import { createServer, type Server } from 'http';
import type { Hono } from 'hono';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from './config/logger.js';
import { initializeModal, type ModalContext } from './lib/sandbox/modal/client.js';
import { EventBus } from './core/event-bus.js';
import { SessionManager } from './core/session-manager.js';
import { createWebSocketServer as createWSServer } from './transport/websocket/index.js';
import { createRestServer } from './transport/rest/server.js';
import type {
  RuntimeConfig,
} from './types/runtime.js';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from './types/events.js';

/**
 * Agent runtime instance returned by createAgentRuntime
 */
export type AgentRuntime = {
  sessionManager: SessionManager;
  eventBus: EventBus;
  createRestServer: (config: { apiKey: string }) => Hono;
  createWebSocketServer: (httpServer: Server) => SocketIOServer<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >;
  start: () => Promise<void>;
  shutdown: () => Promise<void>;
  isHealthy: () => boolean;
};

/**
 * Create and initialize the agent runtime
 *
 * @param config - Runtime configuration with all required adapters
 * @returns Initialized runtime instance
 *
 * @example
 * ```typescript
 * const runtime = await createAgentRuntime({
 *   persistence: new ConvexPersistenceAdapter(...),
 *   profileLoader: new FileProfileLoader('./profiles'),
 *   sandboxConfig: new MyAppSandboxConfig(...),
 *   modal: {
 *     tokenId: process.env.MODAL_TOKEN_ID,
 *     tokenSecret: process.env.MODAL_TOKEN_SECRET,
 *     appName: 'my-app-agents',
 *   },
 * });
 *
 * await runtime.start();
 * ```
 */
export async function createAgentRuntime(
  config: RuntimeConfig
): Promise<AgentRuntime> {
  logger.info('Creating agent runtime...');

  // Initialize Modal client
  const modalContext: ModalContext = await initializeModal({
    tokenId: config.modal.tokenId,
    tokenSecret: config.modal.tokenSecret,
    appName: config.modal.appName,
  });

  logger.debug('Modal context created');

  // Create EventBus for domain events
  const eventBus = new EventBus();
  logger.debug('EventBus created');

  // Create SessionManager with injected adapters
  const sessionManager = new SessionManager(
    modalContext,
    eventBus,
    {
      persistence: config.persistence,
    },
    {
      idleTimeoutMs: config.idleTimeoutMs ?? 900000, // 15 min default
      syncIntervalMs: config.syncIntervalMs ?? 30000, // 30 sec default
    }
  );

  logger.debug('SessionManager created');

  // Return runtime instance
  const runtime = {
    sessionManager,
    eventBus,

    /**
     * Create a Hono REST API server
     * @param config - REST server configuration
     * @returns Hono application instance
     */
    createRestServer(config: { apiKey: string }) {
      const restServer = createRestServer({
        sessionManager,
        eventBus,
        config,
      });
      logger.info('REST server created');
      return restServer;
    },

    /**
     * Create a WebSocket server attached to an HTTP server
     * @param httpServer - HTTP server instance (from @hono/node-server or similar)
     * @returns Socket.IO server instance
     */
    createWebSocketServer(httpServer: Server) {
      const wsServer = createWSServer(httpServer, sessionManager, eventBus);
      logger.info('WebSocket server created');
      return wsServer;
    },

    async start(): Promise<void> {
      logger.info('Starting agent runtime...');

      // Initialize SessionManager (fetch all sessions from persistence)
      await sessionManager.initialize();

      // Start background jobs (idle timeout monitoring)
      sessionManager.startBackgroundJobs();

      logger.info('Agent runtime started successfully');
    },

    async shutdown(): Promise<void> {
      logger.info('Shutting down agent runtime...');

      // Gracefully shutdown SessionManager (sync all sessions, terminate sandboxes)
      await sessionManager.shutdown();

      logger.info('Agent runtime shutdown complete');
    },

    isHealthy(): boolean {
      // Simple health check - SessionManager is responsive
      return sessionManager.isHealthy();
    },
  };

  logger.info('Agent runtime created successfully');

  return runtime;
}
